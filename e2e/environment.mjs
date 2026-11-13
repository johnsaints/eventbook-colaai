export const apiUrl = 'http://127.0.0.1:13333'
export const frontendUrl = 'http://127.0.0.1:15173'

export function getE2EDatabaseUrl() {
  const value = process.env.E2E_DATABASE_URL
  if (!value || !URL.canParse(value)) {
    throw new Error('Defina E2E_DATABASE_URL com a conexão MySQL local para eventbook_e2e.')
  }

  const url = new URL(value)
  if (url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || url.pathname !== '/eventbook_e2e') {
    throw new Error('O E2E exige um MySQL local com o banco eventbook_e2e.')
  }
  return url.href
}
