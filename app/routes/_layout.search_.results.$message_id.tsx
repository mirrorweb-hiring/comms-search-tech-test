import { type LoaderFunctionArgs } from '@remix-run/node'
import { json, useLoaderData, useParams } from '@remix-run/react'
import { requireSession } from '~/lib/auth'
import { api } from '~/lib/utils'

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await requireSession(request)

  const messageId = params.message_id
  if (!messageId) {
    throw new Response('Message ID is required', { status: 400 })
  }

  const message = await api(`/messages/${messageId}`, {
    headers: {
      cookie: session,
    },
  })

  return json({ message })
}

export default function Message() {
  const { message } = useLoaderData<typeof loader>()
  const params = useParams()

  if (!params.message_id || !message) {
    return (
      <div className='relative h-full'>
        <div className='h-full mx-auto max-w-3xl px-8'>
          <div className='h-full overflow-hidden bg-white ring-1 ring-gray-900/5 rounded-xl shadow'>
            <div className='h-full p-8 space-y-6'>
              <p className='text-sm text-gray-500'>Message not found</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='relative h-full'>
      <div className='h-full mx-auto max-w-3xl px-8'>
        <div className='h-full overflow-y-auto bg-white ring-1 ring-gray-900/5 rounded-xl shadow'>
          <div className='p-8 space-y-6'>
            <div className='space-y-1'>
              <h2 className='text-lg font-semibold leading-6 text-gray-900'>
                {message.subject}
              </h2>
              <p className='text-sm text-gray-500'>{message.from_email}</p>
            </div>

            <div className='prose prose-sm max-w-none'>
              <p className='text-sm leading-6 text-gray-900 whitespace-pre-wrap'>
                {message.content}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
