export const isAuthorizedUpload = (authorizationHeader: string | undefined, expectedToken: string) => {
  if (!authorizationHeader) return false
  const [scheme, token] = authorizationHeader.split(/\s+/, 2)
  return scheme === 'Bearer' && token === expectedToken
}
