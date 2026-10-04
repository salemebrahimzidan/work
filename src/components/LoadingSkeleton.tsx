export function SkeletonRows({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <td key={column}>
              <span className={column === 0 ? 'skeleton skeleton-line' : 'skeleton skeleton-short'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function SkeletonTable({ headers, rows = 8 }: { headers: string[]; rows?: number }) {
  return (
    <div className="table-wrap" aria-busy="true">
      <table>
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={`${header}-${index}`}>{header || <span className="skeleton skeleton-short" />}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <SkeletonRows columns={headers.length} rows={rows} />
        </tbody>
      </table>
    </div>
  )
}

export function SkeletonStack({ count = 6 }: { count?: number }) {
  return (
    <div className="skeleton-stack" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="skeleton skeleton-line" />
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div aria-busy="true">
      <div className="page-head">
        <div>
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-line" />
        </div>
        <span className="skeleton skeleton-pill" />
      </div>
      <div className="card">
        <div className="profile-grid">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="profile-field" key={index}>
              <span className="skeleton skeleton-short" />
              <span className="skeleton skeleton-line" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
