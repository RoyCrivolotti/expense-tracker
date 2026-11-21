/** "1,2M (ended 2035)": a figure, and the year its line ended in where it has ended. */
export function withEnded(figure: string, endedIn: string | undefined): string {
  return endedIn ? `${figure} (ended ${endedIn})` : figure
}
