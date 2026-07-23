import { fireEvent, screen, waitFor, within } from '@testing-library/react'

export async function selectSemiOption(control: HTMLElement, value: string) {
  fireEvent.click(control)
  const options = await screen.findAllByRole('option')
  const option = options.find((candidate) => candidate.dataset.value === value)
  if (!option) {
    throw new Error(`Semi option with value "${value}" was not found`)
  }
  fireEvent.click(option)
}

export async function getSemiOptionValues(control: HTMLElement) {
  fireEvent.click(control)
  const listboxId = control.getAttribute('aria-controls')
  const listbox = await waitFor(() => {
    const element = listboxId ? document.getElementById(listboxId) : null
    if (!element) throw new Error('Semi listbox was not mounted')
    return element
  })
  const values = within(listbox)
    .getAllByRole('option')
    .map((option) => option.dataset.value ?? '')
  fireEvent.keyDown(control, { key: 'Escape' })
  return values
}

export async function isSemiOptionDisabled(control: HTMLElement, value: string) {
  fireEvent.click(control)
  const options = await screen.findAllByRole('option')
  const option = options.find((candidate) => candidate.dataset.value === value)
  if (!option) throw new Error(`Semi option with value "${value}" was not found`)
  const disabled = option.getAttribute('aria-disabled') === 'true' || option.classList.contains('semi-select-option-disabled')
  fireEvent.keyDown(control, { key: 'Escape' })
  return disabled
}
