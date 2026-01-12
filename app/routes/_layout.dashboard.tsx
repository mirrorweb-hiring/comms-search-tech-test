import { ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/20/solid'
import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { useEffect, useState } from 'react'
import { requireSession } from '~/lib/auth'
import { api, API_URL, classNames, formatRelativeTime } from '~/lib/utils'

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) {
    return (
      <span className='inline-flex items-center rounded-sm bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-800 whitespace-nowrap'>
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
    <span className={classNames('inline-flex items-center rounded-sm px-1 py-0.5 text-[10px] font-medium whitespace-nowrap', config.className)}>
      {config.label}
    </span>
  )
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await requireSession(request)

  // Use Promise.allSettled to handle individual failures gracefully
  const [totalMessagesResult, totalActionsResult] = await Promise.allSettled([
    api('/stats/total-messages', { headers: { cookie: session } }),
    api('/stats/total-message-actions', { headers: { cookie: session } }),
  ])

  // Handle each result independently, providing fallback values on failure
  const totalMessages =
    totalMessagesResult.status === 'fulfilled'
      ? totalMessagesResult.value
      : { currentMonth: null, previousMonth: null, error: true }

  const totalActions =
    totalActionsResult.status === 'fulfilled'
      ? totalActionsResult.value
      : { currentMonth: null, previousMonth: null, error: true }

  return json({ totalMessages, totalActions })
}

export default function Dashboard() {
  const { totalMessages, totalActions } = useLoaderData<typeof loader>()

  return (
    <div className='py-4'>
      <main>
        <div className='mx-auto max-w-6xl py-4 px-8'>
          <div className='space-y-6'>
            <div>
              <h3 className='text-base font-semibold leading-6 text-gray-900'>
                Last 30 days
              </h3>
              <dl className='mt-4 grid grid-cols-2 divide-x overflow-hidden rounded-lg bg-white shadow'>
                <StatsTotalCard
                  name='Total Messages'
                  currentMonth={totalMessages.currentMonth}
                  previousMonth={totalMessages.previousMonth}
                  hasError={totalMessages.error}
                />
                <StatsTotalCard
                  name='Reviewed Messages'
                  currentMonth={totalActions.currentMonth}
                  previousMonth={totalActions.previousMonth}
                  hasError={totalActions.error}
                />
              </dl>
            </div>

            <div>
              <h3 className='text-base font-semibold leading-6 text-gray-900'>
                Most recent messages
              </h3>
              <MessageList />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function StatsTotalCard({ name, currentMonth, previousMonth, hasError }: any) {
  // Show error state if data failed to load
  if (hasError || currentMonth === null || previousMonth === null) {
    return (
      <div className='px-4 py-5 sm:p-6'>
        <dt className='text-base font-normal text-gray-900'>{name}</dt>
        <dd className='mt-1 flex items-baseline justify-between md:block lg:flex'>
          <div className='text-sm font-medium text-gray-500'>
            Unable to load data
          </div>
        </dd>
      </div>
    )
  }

  const change = Number((((currentMonth - previousMonth) / previousMonth) * 100).toFixed(2))
  const changeType = change > 0 ? 'increase' : 'decrease'

  return (
    <div className='px-4 py-5 sm:p-6'>
      <dt className='text-base font-normal text-gray-900'>{name}</dt>
      <dd className='mt-1 flex items-baseline justify-between md:block lg:flex'>
        <div className='flex items-baseline text-2xl font-semibold text-pink-600'>
          {currentMonth}
          <span className='ml-2 text-sm font-medium text-gray-500'>
            {changeType === 'increase' ? 'up' : 'down'} from {previousMonth}
          </span>
        </div>

        <div
          className={classNames(
            changeType === 'increase'
              ? 'bg-green-100 text-green-400'
              : 'bg-red-100 text-red-400',
            'inline-flex items-baseline rounded-full px-2.5 py-0.5 text-sm font-medium md:mt-2 lg:mt-0'
          )}
        >
          {changeType === 'increase' ? (
            <ArrowUpIcon className='-ml-1 mr-0.5 h-5 w-5 flex-shrink-0 self-center text-green-400' />
          ) : (
            <ArrowDownIcon className='-ml-1 mr-0.5 h-5 w-5 flex-shrink-0 self-center text-red-400' />
          )}

          <span className='sr-only'>
            {' '}
            {changeType === 'increase' ? 'Increased' : 'Decreased'} by{' '}
          </span>
          <span>{change + '%'}</span>
        </div>
      </dd>
    </div>
  )
}

function MessageList() {
  const [messages, setMessages] = useState([])

  useEffect(() => {
    fetch(API_URL + '/messages', {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const contentType = res.headers.get('content-type')
          let errorMessage = `Request failed with status ${res.status}: ${res.statusText}`
          
          // Read response body as text first (can only be read once)
          const text = await res.text()
          
          // Try to parse as JSON if content type suggests it
          if (contentType?.includes('application/json')) {
            try {
              const errorData = JSON.parse(text)
              errorMessage = errorData.error || errorData.message || errorMessage
            } catch {
              // If JSON parsing fails, use the text as error message
              errorMessage = text || errorMessage
            }
          } else {
            // For non-JSON error responses (like "Gateway Timeout")
            errorMessage = text || errorMessage
          }
          
          throw new Error(errorMessage)
        }
        
        // Read response body as text first (can only be read once)
        // This ensures we can provide helpful error messages even if JSON parsing fails
        const text = await res.text()
        
        const contentType = res.headers.get('content-type')
        if (!contentType?.includes('application/json')) {
          throw new Error(
            `Expected JSON response but received ${contentType || 'unknown content type'}. Response: ${text.substring(0, 100)}`
          )
        }
        
        // Parse JSON from the text we already read
        try {
          return JSON.parse(text)
        } catch (parseError) {
          // If JSON parsing fails, we still have the text to include in the error
          throw new Error(
            `Failed to parse JSON response. Response: ${text.substring(0, 100)}`
          )
        }
      })
      .then((data) => {
        setMessages(data)
      })
      .catch((error) => {
        console.error('Failed to fetch messages:', error)
        setMessages([])
      })
  }, [])

  return (
    <ul
      role='list'
      className='mt-4 divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl'
    >
      {messages && messages.length > 0 && messages.map((message: any) => {
        return (
          <li key={message.id} className='relative'>
            <Link
              to={`/search/results/${message.id}`}
              className='flex justify-between gap-x-6 px-3 py-4 hover:bg-gray-50 sm:px-6 cursor-pointer'
            >
              <div className='flex min-w-0 gap-x-4'>
                <div className='min-w-0 flex-auto'>
                  <div className='text-sm font-semibold leading-6 text-gray-900'>
                    {message.from_email}
                  </div>
                  <p className='mt-1 flex text-xs leading-5 text-gray-500'>
                    <span className='relative truncate'>
                      {message.subject}
                    </span>
                  </p>
                </div>
              </div>
              <div className='flex shrink-0 items-center gap-x-4'>
                <StatusBadge status={message.status} />
                <div className='hidden sm:flex sm:flex-col sm:items-end'>
                  <p className='text-xs leading-5 text-gray-500'>
                    {formatRelativeTime(message.created_at * 1000)}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
