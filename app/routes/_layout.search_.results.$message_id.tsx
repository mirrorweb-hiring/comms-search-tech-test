import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node'
import { json, Link, useFetcher, useLoaderData, useParams, useRevalidator, useSearchParams } from '@remix-run/react'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import { useEffect, useState } from 'react'
import { requireSession } from '~/lib/auth'
import { api, API_URL, classNames } from '~/lib/utils'

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await requireSession(request)

  const messageId = params.message_id
  if (!messageId) {
    throw new Response('Message ID is required', { status: 400 })
  }

  try {
    const message = await api(`/messages/${messageId}`, {
      headers: {
        cookie: session,
      },
    })

    return json({ message })
  } catch (error) {
    // Return error state instead of throwing to allow UI to handle gracefully
    return json(
      {
        message: null,
        error: error instanceof Error ? error.message : 'Failed to load message',
      },
      { status: 500 }
    )
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await requireSession(request)

  const messageId = params.message_id
  if (!messageId) {
    return json({ error: 'Message ID is required' }, { status: 400 })
  }

  const formData = await request.formData()
  const status = formData.get('status') as string

  if (!status || (status !== 'compliant' && status !== 'non_compliant')) {
    return json({ error: 'Invalid status' }, { status: 400 })
  }

  try {
    const response = await fetch(`${API_URL}/messages/${messageId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: session,
      },
      body: JSON.stringify({ status }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to update message' }))
      return json({ error: error.error || 'Failed to update message' }, { status: response.status })
    }

    // Reload the message to get updated data
    const message = await api(`/messages/${messageId}`, {
      headers: {
        cookie: session,
      },
    })

    return json({ message, success: true })
  } catch (error) {
    return json({ error: 'Failed to update message' }, { status: 500 })
  }
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className='inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800'>
        No Status
      </span>
    )
  }

  const statusConfig = {
    compliant: {
      label: 'Compliant',
      className: 'bg-green-100 text-green-800',
    },
    non_compliant: {
      label: 'Non-Compliant',
      className: 'bg-red-100 text-red-800',
    },
  }

  const config = statusConfig[status as keyof typeof statusConfig] || {
    label: status,
    className: 'bg-gray-100 text-gray-800',
  }

  return (
    <span className={classNames('inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium', config.className)}>
      {config.label}
    </span>
  )
}

export default function Message() {
  const loaderData = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const params = useParams()
  const revalidator = useRevalidator()
  const [searchParams] = useSearchParams()
  
  // Check if we came from dashboard (no search query)
  const query = searchParams.get('q')
  const cameFromDashboard = !query

  // Revalidate loader data after successful update to ensure fresh data
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && 'success' in fetcher.data && (fetcher.data as { success: boolean }).success) {
      revalidator.revalidate()
    }
  }, [fetcher.state, fetcher.data, revalidator])

  // Use updated message from fetcher only if it matches current message ID, otherwise use loader data
  const fetcherMessage = fetcher.data && 'message' in fetcher.data ? (fetcher.data as { message: any }).message : null
  // Only use fetcher message if it matches the current message ID to prevent stale data from previous updates
  const shouldUseFetcherMessage = fetcherMessage && fetcherMessage.id === params.message_id
  const message = shouldUseFetcherMessage ? fetcherMessage : ('message' in loaderData ? loaderData.message : null)
  const loaderError = 'error' in loaderData ? (loaderData as { error: string }).error : null
  // Only show fetcher error if it's for the current message (when we're using fetcher message)
  const fetcherError = fetcher.data && 'error' in fetcher.data && shouldUseFetcherMessage ? (fetcher.data as { error: string }).error : null
  const error = loaderError || fetcherError

  // Manage select value state - reset when message changes
  const [selectedStatus, setSelectedStatus] = useState<string>(message?.status || 'compliant')
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [isFadingOut, setIsFadingOut] = useState(false)
  
  // Update selected status when message changes
  useEffect(() => {
    if (message) {
      setSelectedStatus(message.status || 'compliant')
    }
  }, [message?.id, message?.status])

  // Show success message and auto-hide after 3 seconds with fade-out
  useEffect(() => {
    if (shouldUseFetcherMessage && fetcher.data && 'success' in fetcher.data && fetcher.data.success && fetcher.state === 'idle') {
      setShowSuccessMessage(true)
      setIsFadingOut(false)
      const fadeTimer = setTimeout(() => {
        setIsFadingOut(true)
        const hideTimer = setTimeout(() => {
          setShowSuccessMessage(false)
          setIsFadingOut(false)
        }, 300) // Match transition duration
        return () => clearTimeout(hideTimer)
      }, 3000)
      return () => clearTimeout(fadeTimer)
    } else {
      setShowSuccessMessage(false)
      setIsFadingOut(false)
    }
  }, [shouldUseFetcherMessage, fetcher.data, fetcher.state])

  if (!params.message_id) {
    return (
      <div className='relative h-full'>
        <div className='h-full mx-auto max-w-3xl px-8'>
          <div className='h-full overflow-hidden bg-white ring-1 ring-gray-900/5 rounded-xl shadow'>
            <div className='h-full p-8 space-y-6'>
              <p className='text-sm text-gray-500'>Message ID is required</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error && !message) {
    return (
      <div className='relative h-full'>
        <div className='h-full mx-auto max-w-3xl px-8'>
          <div className='h-full overflow-hidden bg-white ring-1 ring-gray-900/5 rounded-xl shadow'>
            <div className='h-full p-8 space-y-6'>
              <div className='rounded-md bg-red-50 p-4'>
                <p className='text-sm font-medium text-red-800'>{typeof error === 'string' ? error : 'Failed to load message'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!message) {
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

  const isUpdating = fetcher.state === 'submitting'
  // Only show success/error messages if they're for the current message
  const showError = shouldUseFetcherMessage && fetcher.data && 'error' in fetcher.data && fetcher.state === 'idle'
  const errorMessage = showError && fetcher.data && 'error' in fetcher.data ? (fetcher.data as { error: string }).error : null
  // Disable button if selected status matches current status (only if status is set)
  const isStatusUnchanged = message?.status !== null && message?.status !== undefined && selectedStatus === message.status

  return (
    <div className='relative h-full'>
      <div className='h-full mx-auto max-w-3xl px-8'>
        <div className='h-full overflow-y-auto bg-white ring-1 ring-gray-900/5 rounded-xl shadow relative'>
          {showSuccessMessage && (
            <div className='absolute inset-0 z-50 flex items-center justify-center pointer-events-none'>
              <div className={classNames(
                'rounded-md bg-green-50 p-4 transition-opacity duration-300 ease-in-out',
                isFadingOut ? 'opacity-0' : 'opacity-100'
              )}>
                <p className='text-sm font-medium text-green-800'>Status updated successfully</p>
              </div>
            </div>
          )}
          <div className='p-8 space-y-6'>
            {cameFromDashboard && (
              <div className='mb-4'>
                <Link
                  to='/dashboard'
                  className='inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-600 focus:ring-offset-2 rounded-md px-3 py-2 transition-colors'
                  aria-label='Back to dashboard'
                >
                  <ArrowLeftIcon className='h-4 w-4' aria-hidden='true' />
                  Back to Dashboard
                </Link>
              </div>
            )}
            <div className='space-y-3'>
              <div className='space-y-1'>
                <h2 className='text-lg font-semibold leading-6 text-gray-900'>
                  {message.subject}
                </h2>
                <p className='text-sm text-gray-500'>{message.from_email}</p>
              </div>

              <div className='flex items-center gap-4'>
                <div>
                  <label htmlFor='status' className='block text-sm font-medium text-gray-700 mb-1'>
                    Status
                  </label>
                  <StatusBadge status={message.status} />
                </div>
              </div>

              <fetcher.Form method='post' className='space-y-3'>
                <div className='relative'>
                  <label htmlFor='status-select' className='block text-sm font-medium text-gray-700 mb-1'>
                    Update Status
                  </label>
                  <p id='status-select-description' className='sr-only'>
                    Select whether the message is compliant or non-compliant
                  </p>
                  <select
                    id='status-select'
                    name='status'
                    disabled={isUpdating}
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className='block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-pink-600 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed appearance-none bg-white'
                    aria-label='Select message status'
                    aria-describedby='status-select-description'
                    required
                  >
                    <option value='compliant'>Compliant</option>
                    <option value='non_compliant'>Non-Compliant</option>
                  </select>
                </div>
                <button
                  type='submit'
                  disabled={isUpdating || isStatusUnchanged}
                  className='inline-flex items-center rounded-md bg-pink-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-pink-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:hover:bg-gray-400'
                >
                  {isUpdating ? 'Updating...' : 'Update Status'}
                </button>
              </fetcher.Form>

              {showError && (
                <div className='rounded-md bg-red-50 p-4'>
                  <p className='text-sm font-medium text-red-800'>
                    {errorMessage || 'Failed to update status'}
                  </p>
                </div>
              )}
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
