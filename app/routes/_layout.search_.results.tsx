import { type LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useSearchParams, useNavigate, useParams } from '@remix-run/react'
import { requireSession } from '~/lib/auth'
import { api, classNames, formatRelativeTime } from '~/lib/utils'

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

  const url = new URL(request.url)
  const query = url.searchParams.get('q') || ''
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const limit = 20

  try {
    const result = await api(`/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`, {
      headers: {
        cookie: session,
      },
    })

    return json({
      messages: result.messages || [],
      total: result.total || 0,
      page: result.page || 1,
      totalPages: result.totalPages || 1,
      query,
    })
  } catch (error) {
    // Return empty results on error rather than crashing
    return json({
      messages: [],
      total: 0,
      page: 1,
      totalPages: 1,
      query,
      error: error instanceof Error ? error.message : 'Failed to load search results',
    })
  }
}

export default function SearchResults() {
  const loaderData = useLoaderData<typeof loader>()
  const { messages, total, page, totalPages, query } = loaderData
  const error = 'error' in loaderData ? loaderData.error : undefined
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const params = useParams()
  // Hide search header when viewing a message detail (no search query)
  const isViewingMessageDetail = !!params.message_id && !query

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    const params = new URLSearchParams(searchParams)
    params.set('page', newPage.toString())
    navigate(`/search/results?${params.toString()}`, { preventScrollReset: true })
  }

  const handleKeyDown = (event: React.KeyboardEvent, newPage: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handlePageChange(newPage)
    }
  }

  const startIndex = (page - 1) * 20 + 1
  const endIndex = Math.min(page * 20, total)

  // Generate page numbers to display (show all pages if 10 or fewer, otherwise show window with ellipsis)
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxPagesToShow = 10

    // If we have 10 or fewer pages, show all of them
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
      return pages
    }

    // For more than 10 pages, show a window around the current page
    let startPage: number
    let endPage: number
    const windowSize = 5 // Show 5 pages in the middle window

    if (page <= 3) {
      // Near the beginning: show first 6 pages, ellipsis, then last page
      startPage = 1
      endPage = 6
    } else if (page >= totalPages - 2) {
      // Near the end: show first page, ellipsis, then last 6 pages
      startPage = totalPages - 5
      endPage = totalPages
    } else {
      // In the middle: show first page, ellipsis, window around current, ellipsis, last page
      // Show 2 pages before and 2 pages after current (total of 5 pages in window)
      startPage = Math.max(2, page - 2)
      endPage = Math.min(totalPages - 1, page + 2)
    }

    // Always show first page
    if (startPage > 1) {
      pages.push(1)
      if (startPage > 2) {
        pages.push('...')
      }
    }

    // Show the window of pages
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i)
    }

    // Always show last page if not already included
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push('...')
      }
      pages.push(totalPages)
    }

    return pages
  }

  return (
    <div className='py-4'>
      <main>
        <div className='mx-auto max-w-6xl py-4 px-8'>
          <div className='overflow-hidden rounded-lg bg-white shadow'>
            <div className='p-8 space-y-6'>
              {!isViewingMessageDetail && (
                <div className='space-y-1'>
                  <h2 className='text-xl font-semibold leading-6 text-gray-900'>
                    Search Results
                  </h2>
                  {query && (
                    <p className='text-sm text-gray-500'>
                      Showing results for:{' '}
                      <span className='font-semibold text-gray-900'>
                        {query}
                      </span>
                    </p>
                  )}
                  {!query && (
                    <p className='text-sm text-gray-500'>
                      Please provide a search query
                    </p>
                  )}
                  {total > 0 && (
                    <p className='text-sm text-gray-500'>
                      Showing {startIndex}-{endIndex} of {total} results
                    </p>
                  )}
                  {error && typeof error === 'string' ? (
                    <div className='rounded-md bg-red-50 p-4'>
                      <p className='text-sm font-medium text-red-800'>{error}</p>
                    </div>
                  ) : null}
                </div>
              )}

              {!isViewingMessageDetail ? (
                <>
                  <div className='flex space-x-4'>
                    <div className='w-2/5 flex-shrink-0 flex flex-col'>
                      <ul
                        role='list'
                        className='divide-y divide-gray-100 overflow-y-auto bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl flex-1'
                      >
                        {messages && messages.length > 0 ? (
                          messages.map((message: any) => {
                            const messageUrl = `/search/results/${message.id}?q=${encodeURIComponent(query)}&page=${page}`
                            return (
                              <li key={message.id} className='relative'>
                                <Link
                                  to={messageUrl}
                                  className='flex justify-between gap-x-6 px-3 py-4 hover:bg-gray-50 sm:px-6 cursor-pointer'
                                >
                                  <div className='flex min-w-0 gap-x-4 flex-1'>
                                    <div className='min-w-0 flex-auto'>
                                      <div className='text-sm font-semibold leading-6 text-gray-900'>
                                        {message.from_email}
                                      </div>
                                      <p className='mt-1 flex text-xs leading-5 text-gray-500'>
                                        <span className='relative truncate'>
                                          {message.content}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                  <div className='hidden sm:flex sm:flex-col sm:items-end gap-1'>
                                    <StatusBadge status={message.status} />
                                    <p className='text-xs leading-5 text-gray-500'>
                                      {message.created_at ? formatRelativeTime(message.created_at * 1000) : ''}
                                    </p>
                                  </div>
                                </Link>
                              </li>
                            )
                          })
                        ) : (
                          <li className='px-3 py-4 sm:px-6'>
                            <p className='text-sm text-gray-500'>No messages found</p>
                          </li>
                        )}
                      </ul>
                    </div>

                    <div className='h-full w-full'>
                      <Outlet />
                    </div>
                  </div>

                  {/* Pagination Controls - Full Width */}
                  {totalPages > 1 && (
                <div className='mt-4 flex items-center justify-center border-t border-gray-200 bg-white px-4 py-3 sm:px-8'>
                  <div className='flex flex-1 justify-between sm:hidden'>
                    <button
                      onClick={() => handlePageChange(page - 1)}
                      onKeyDown={(e) => handleKeyDown(e, page - 1)}
                      disabled={page === 1}
                      className='relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline focus:outline-2 focus:outline-pink-600 disabled:opacity-50 disabled:cursor-not-allowed'
                      aria-label='Previous page'
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(page + 1)}
                      onKeyDown={(e) => handleKeyDown(e, page + 1)}
                      disabled={page === totalPages}
                      className='relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline focus:outline-2 focus:outline-pink-600 disabled:opacity-50 disabled:cursor-not-allowed'
                      aria-label='Next page'
                    >
                      Next
                    </button>
                  </div>
                  <div className='hidden sm:flex sm:items-center sm:gap-6'>
                    <p className='text-sm text-gray-700'>
                      Page <span className='font-medium'>{page}</span> of{' '}
                      <span className='font-medium'>{totalPages}</span>
                    </p>
                    <nav className='isolate inline-flex -space-x-px rounded-md shadow-sm' aria-label='Pagination'>
                        <button
                          onClick={() => handlePageChange(page - 1)}
                          onKeyDown={(e) => handleKeyDown(e, page - 1)}
                          disabled={page === 1}
                          className='relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 focus:outline focus:outline-2 focus:outline-pink-600 disabled:opacity-50 disabled:cursor-not-allowed'
                          aria-label='Previous page'
                        >
                          <span className='sr-only'>Previous</span>
                          Previous
                        </button>
                        {getPageNumbers().map((pageNum, index) => {
                          if (pageNum === '...') {
                            return (
                              <span
                                key={`ellipsis-${index}`}
                                className='relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300'
                              >
                                ...
                              </span>
                            )
                          }
                          const pageNumber = pageNum as number
                          const isCurrentPage = pageNumber === page
                          return (
                            <button
                              key={pageNumber}
                              onClick={() => handlePageChange(pageNumber)}
                              onKeyDown={(e) => handleKeyDown(e, pageNumber)}
                              aria-label={`Page ${pageNumber}`}
                              aria-current={isCurrentPage ? 'page' : undefined}
                              className={classNames(
                                isCurrentPage
                                  ? 'z-10 bg-pink-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600'
                                  : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 focus:outline focus:outline-2 focus:outline-pink-600',
                                'relative inline-flex items-center px-4 py-2 text-sm font-semibold'
                              )}
                            >
                              {pageNumber}
                            </button>
                          )
                        })}
                        <button
                          onClick={() => handlePageChange(page + 1)}
                          onKeyDown={(e) => handleKeyDown(e, page + 1)}
                          disabled={page === totalPages}
                          className='relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 focus:outline focus:outline-2 focus:outline-pink-600 disabled:opacity-50 disabled:cursor-not-allowed'
                          aria-label='Next page'
                        >
                          <span className='sr-only'>Next</span>
                          Next
                        </button>
                      </nav>
                    </div>
                  </div>
                  )}
                </>
              ) : (
                <div className='h-full w-full'>
                  <Outlet />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
