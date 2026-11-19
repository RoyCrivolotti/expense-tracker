import type {
  PushRepository,
  PushTarget,
} from "../../../src/domain/ports/pushRepository";
import type { CaptureEnv } from "./env";
import { consolePushLogger } from "./pushLog";
import type { PushLogLine, PushLogger } from "./pushLog";
import { PushTimeoutError, sendWebPush } from "./webpush";
import type { VapidKeys } from "./webpush";

/** A payment stored as a recommendation of its own: what the notification says and where a tap goes. */
export interface CreatedPayment {
  owner: string;
  recommendationId: string;
  amountCents: number;
  currency: string;
  /** The merchant when the template knows where it sits in the wording, else null: the whole bank text is not shown. */
  merchant: string | null;
}

/** What sending to a device needs: the rows to prune and note, the network and the clock. */
export type SendDeps = Pick<NotifyDeps, "push" | "fetcher" | "now">;

export interface NotifyDeps {
  push: PushRepository;
  /** The person's open count, for the badge. */
  countOpen: (owner: string) => Promise<number>;
  fetcher: typeof fetch;
  now: () => Date;
  log?: PushLogger;
}

/** A payment is still worth reviewing tomorrow; the push service drops it after that. */
const TTL_SECONDS = 86_400;

/** The keys the Worker was given, or null when any is unset: the Worker then sends nothing and captures as before. */
export function vapidKeysOf(env: CaptureEnv): VapidKeys | null {
  const {
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_SUBJECT: subject,
  } = env;
  return privateKey && publicKey && subject
    ? { privateKey, publicKey, subject }
    : null;
}

/** What the service worker in `src/sw/push.ts` reads. */
export function paymentPayload(payment: CreatedPayment, open: number): string {
  return JSON.stringify({
    v: 1,
    kind: "payment",
    id: payment.recommendationId,
    url: `/?review=${payment.recommendationId}`,
    amountCents: payment.amountCents,
    currency: payment.currency,
    merchant: payment.merchant,
    open,
  });
}

export interface Attempt {
  outcome: PushLogLine["outcome"];
  reason: PushLogLine["reason"];
  status: number;
}

async function sendTo(
  target: PushTarget,
  body: string,
  keys: VapidKeys,
  owner: string,
  topic: string,
  deps: SendDeps,
): Promise<Attempt> {
  const now = deps.now();
  let status: number;
  try {
    status = (
      await sendWebPush(
        target,
        body,
        keys,
        { ttl: TTL_SECONDS, topic },
        deps.fetcher,
        now.getTime(),
      )
    ).status;
  } catch (error) {
    return {
      outcome: "failed",
      reason: error instanceof PushTimeoutError ? "timeout" : "network",
      status: 0,
    };
  }
  if (status === 404 || status === 410) {
    await deps.push.deleteSubscription(owner, target.id);
    return { outcome: "gone", reason: "expired", status };
  }
  await deps.push.recordSend(
    owner,
    target.id,
    status,
    now.toISOString(),
  );
  return status >= 200 && status < 300
    ? { outcome: "sent", reason: "ok", status }
    : { outcome: "failed", reason: "push-service-error", status };
}

/**
 * Sends one body to each device at once. A failure for one device is its own log line and never stops the others, and
 * it never throws.
 */
export async function deliver(
  owner: string,
  targets: PushTarget[],
  body: string,
  topic: string,
  keys: VapidKeys,
  deps: SendDeps,
  line: (attempt: Attempt, devices: number) => void,
): Promise<void> {
  await Promise.all(
    targets.map(async (target) => {
      try {
        line(
          await sendTo(target, body, keys, owner, topic, deps),
          targets.length,
        );
      } catch {
        line(
          { outcome: "failed", reason: "exception", status: 0 },
          targets.length,
        );
      }
    }),
  );
}

/**
 * Tells each of the person's devices about a payment, when they chose a push per payment. Never throws: a send runs
 * after the phone has its answer, and a failure here must not become one. One log line per device, or one for the
 * reason nothing was sent.
 */
export async function notifyPayment(
  payment: CreatedPayment,
  env: CaptureEnv,
  deps: NotifyDeps,
): Promise<void> {
  const log = deps.log ?? consolePushLogger;
  const started = Date.now();
  const line = (attempt: Attempt, devices: number): void =>
    log({ event: "push", ...attempt, devices, ms: Date.now() - started });
  const skipped = (reason: PushLogLine["reason"], devices = 0): void =>
    line({ outcome: "skipped", reason, status: 0 }, devices);
  try {
    const keys = vapidKeysOf(env);
    if (!keys) return skipped("not-configured");
    const settings = await deps.push.getSettings(payment.owner);
    if (!settings) return skipped("no-devices");
    if (settings.mode !== "each") return skipped("summary-mode");
    const targets = await deps.push.listTargets(payment.owner);
    if (targets.length === 0) return skipped("no-devices");
    const body = paymentPayload(payment, await deps.countOpen(payment.owner));
    await deliver(
      payment.owner,
      targets,
      body,
      payment.recommendationId.replace(/-/g, ""),
      keys,
      deps,
      line,
    );
  } catch {
    line({ outcome: "failed", reason: "exception", status: 0 }, 0);
  }
}
