export function confirmDeleteOne(): boolean {
  return window.confirm('Delete this transaction?')
}

export function confirmDeleteMany(count: number): boolean {
  return window.confirm(`Delete ${count} transaction${count === 1 ? '' : 's'}?`)
}
