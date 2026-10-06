/**
 * Petit client HTTP pour l'API FinPrep.
 * Les cookies d'authentification sont envoyés automatiquement (même origine).
 */
export async function api(path, { method = 'GET', body, form } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (form) {
    options.body = form; // FormData : le navigateur fixe lui-même le Content-Type multipart
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}`, options);
  } catch {
    throw new Error('Connexion impossible. Vérifiez votre accès internet puis réessayez.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Erreur ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}
