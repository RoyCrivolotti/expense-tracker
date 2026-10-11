import { Component, type ReactNode } from 'react'

interface ChunkBoundaryProps {
  /** What stands in the part of the page that failed. */
  fallback: ReactNode
  children: ReactNode
}

/**
 * Keeps a failure in one lazily loaded part of the page to that part. A dynamic import that rejects (a dropped
 * connection, or a deploy that replaced the hashed file under a page that was already open) throws while it renders,
 * and with nothing to catch it React unmounts the whole app. There is no retry in place: React.lazy keeps the
 * rejection, so only a reload gets the file again.
 */
export class ChunkBoundary extends Component<ChunkBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
