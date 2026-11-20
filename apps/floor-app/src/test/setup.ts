// Vitest setup (#238): jest-dom matchers (toBeInTheDocument, toHaveTextContent, ...) and
// an RTL cleanup after every test, so one test's rendered tree never leaks into the next.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})
