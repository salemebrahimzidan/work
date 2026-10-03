import { companyRoleLabel, companyStatusLabel, useCompany } from '../auth/CompanyProvider'

export default function CompanySettings() {
  const { company, role, loading, error, ambiguous } = useCompany()

  return (
    <>
      <div className="page-head">
        <div>
          <h1>إعدادات الشركة</h1>
          <p className="page-sub">بيانات الشركة الحالية وصلاحيتك فيها</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {loading ? (
          <div className="empty">جارٍ التحميل…</div>
        ) : !company ? (
          <div className="empty">
            {ambiguous
              ? 'يوجد أكثر من شركة لهذا الحساب ولم تُحدَّد الشركة النشطة.'
              : 'لا توجد شركة نشطة لهذا الحساب.'}
          </div>
        ) : (
          <>
            <div className="profile-grid">
              <div className="profile-field">
                <div className="profile-label">اسم الشركة</div>
                <div className="profile-value">{company.name}</div>
              </div>
              <div className="profile-field">
                <div className="profile-label">حالة الشركة</div>
                <div className="profile-value">
                  <span className={company.status === 'active' ? 'badge badge-completed' : 'badge badge-cancelled'}>
                    {companyStatusLabel[company.status]}
                  </span>
                </div>
              </div>
              <div className="profile-field">
                <div className="profile-label">صلاحيتك</div>
                <div className="profile-value">{role ? companyRoleLabel[role] : 'غير محددة'}</div>
              </div>
            </div>
            <p className="note-line company-note">
              هذه الصفحة للعرض. تعديل اسم الشركة أو حالتها غير متاح من هنا.
            </p>
          </>
        )}
      </div>
    </>
  )
}
