import { PublicClientApplication, type Configuration, type PopupRequest } from '@azure/msal-browser'

const msalConfig: Configuration = {
  auth: {
    clientId:    import.meta.env.VITE_AZURE_CLIENT_ID as string,
    authority:   `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID as string}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation:       'sessionStorage',
  },
}

export const msalInstance = new PublicClientApplication(msalConfig)

export const loginRequest: PopupRequest = {
  scopes: ['User.Read'],
}
