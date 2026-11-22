import { GUIDE_SECTIONS, type GuideBlock } from '../../guide/gettingStarted'
import { GUIDE_TITLE } from '../../guide/guideTitle'
import { Modal } from '../components/Modal'
import styles from './GuideSheet.module.css'

function Block({ block }: { block: GuideBlock }) {
  if (block.kind === 'p') return <p>{block.text}</p>
  const Tag = block.kind === 'steps' ? 'ol' : 'ul'
  return (
    <Tag>
      {block.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </Tag>
  )
}

/**
 * The getting-started guide in the full-height sheet. Its own chunk, loaded only when opened and kept by the service
 * worker like every other, so it reads offline. The text is the same file `docs/GETTING-STARTED.md` is written from.
 */
export default function GuideSheet({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={GUIDE_TITLE} onClose={onClose}>
      <div className={styles.guide}>
        {GUIDE_SECTIONS.map((section) => (
          <div key={section.id} className={styles.section}>
            <h3 className={styles.heading}>
              {section.title}
            </h3>
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        ))}
      </div>
    </Modal>
  )
}
