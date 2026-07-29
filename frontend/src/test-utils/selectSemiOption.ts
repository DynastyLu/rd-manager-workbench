import { fireEvent, waitFor, within } from '@testing-library/react'

async function finishClosingPortal(control: HTMLElement) {
  await waitFor(() => {
    if (control.getAttribute('aria-expanded') !== 'false') {
      throw new Error('Semi listbox did not close')
    }
  })
}

async function getOpenListbox(control: HTMLElement) {
  if (control.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(control)
  }

  return waitFor(() => {
    if (control.getAttribute('aria-expanded') !== 'true') {
      throw new Error('Semi listbox did not open')
    }
    const listboxId = control.getAttribute('aria-controls')
    const popupId = control.dataset.popupid
    const listbox = listboxId ? document.getElementById(listboxId) : null
    const popup = popupId ? document.getElementById(popupId) : null
    if (
      !listbox ||
      !popup ||
      !popup.classList.contains('semi-popover-wrapper-show') ||
      !popup.contains(listbox)
    ) {
      throw new Error('Active Semi listbox was not mounted')
    }
    return listbox
  })
}

async function closeListbox(control: HTMLElement) {
  if (control.getAttribute('aria-expanded') === 'true') {
    fireEvent.keyDown(control, { key: 'Escape', keyCode: 27, which: 27 })
  }
  await finishClosingPortal(control)
}

export async function selectSemiOption(control: HTMLElement, value: string) {
  const listbox = await getOpenListbox(control)
  const options = within(listbox).getAllByRole('option')
  const option = options.find((candidate) => candidate.dataset.value === value)
  if (!option) {
    throw new Error(`Semi option with value "${value}" was not found`)
  }
  fireEvent.click(option)
  await finishClosingPortal(control)
}

export async function getSemiOptionValues(control: HTMLElement) {
  const listbox = await getOpenListbox(control)
  const values = within(listbox)
    .getAllByRole('option')
    .map((option) => option.dataset.value ?? '')
  await closeListbox(control)
  return values
}

export async function isSemiOptionDisabled(control: HTMLElement, value: string) {
  const listbox = await getOpenListbox(control)
  const options = within(listbox).getAllByRole('option')
  const option = options.find((candidate) => candidate.dataset.value === value)
  if (!option) throw new Error(`Semi option with value "${value}" was not found`)
  const disabled =
    option.getAttribute('aria-disabled') === 'true' ||
    option.classList.contains('semi-select-option-disabled')
  await closeListbox(control)
  return disabled
}
