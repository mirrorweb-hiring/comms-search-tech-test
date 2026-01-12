import { type LoaderFunctionArgs } from '@remix-run/node'
import { getSession } from '~/lib/auth'
import { API_URL } from '~/lib/utils'

export async function loader({ request }: LoaderFunctionArgs) {
  const sessionCookie = getSession(request)
  
  // Call the API logout endpoint to delete the session
  if (sessionCookie) {
    await fetch(API_URL + '/logout', {
      headers: {
        cookie: sessionCookie,
      },
    })
  }

  // Clear the cookie and redirect to login
  throw new Response(null, {
    status: 302,
    headers: {
      Location: '/login',
      'Set-Cookie': 'comms_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0',
    },
  })
}
