import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { BrandingProvider } from './contexts/BrandingContext';
import ProtectedRoute from './components/ProtectedRoute';
import SuperAdminLayout from './layouts/SuperAdminLayout';
import { ChurchAdminLayout } from './layouts/ChurchAdminLayout';
import LoginPage from './pages/LoginPage';
import RoleSyncRedirect from './components/RoleSyncRedirect';
import RoleLanding from './components/RoleLanding';

// Portal Layouts (Pastor / Ministry Leader / Member)
import PastorLayout from './layouts/PastorLayout';
import MinistryLeaderLayout from './layouts/MinistryLeaderLayout';
import GroupLeaderLayout from './layouts/GroupLeaderLayout';
import MemberLayout from './layouts/MemberLayout';
import FinanceLayout from './layouts/FinanceLayout';
import SecretaryLayout from './layouts/SecretaryLayout';

// Portal Dashboards

// Church Admin Pages

const Sermons = lazy(() => import('./pages/church/Sermons'));
const PlatformAudit = lazy(() => import('./pages/PlatformAudit'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SecretaryDashboard = lazy(() => import('./pages/workspace/SecretaryDashboard'));
const GroupLeaderPortal = lazy(() => import('./pages/group/GroupLeaderPortal'));
const FinanceDocuments = lazy(() => import('./pages/church/FinanceDocuments'));
const PastorDashboard = lazy(() => import('./pages/pastor/PastorDashboard'));
const PastorPrayers = lazy(() => import('./pages/pastor/PastorPrayers'));
const PastorVisitation = lazy(() => import('./pages/pastor/PastorVisitation'));
const PastorCounseling = lazy(() => import('./pages/pastor/PastorCounseling'));
const PastorMemberCare = lazy(() => import('./pages/pastor/PastorMemberCare'));
const PastorReports = lazy(() => import('./pages/pastor/PastorReports'));
const PastorCommunication = lazy(() => import('./pages/pastor/PastorCommunication'));
const MinistryDashboard = lazy(() => import('./pages/ministry/MinistryDashboard'));
const MinistryMembers = lazy(() => import('./pages/ministry/MinistryMembers'));
const MinistryTasks = lazy(() => import('./pages/ministry/MinistryTasks'));
const MinistryEvents = lazy(() => import('./pages/ministry/MinistryEvents'));
const MinistryReports = lazy(() => import('./pages/ministry/MinistryReports'));
const MinistryCommunication = lazy(() => import('./pages/ministry/MinistryCommunication'));
const MemberDashboard = lazy(() => import('./pages/member/MemberDashboard'));
const MemberGiving = lazy(() => import('./pages/member/MemberGiving'));
const MemberEvents = lazy(() => import('./pages/member/MemberEvents'));
const MemberProfile = lazy(() => import('./pages/member/MemberProfile'));
const MemberGroups = lazy(() => import('./pages/member/MemberGroups'));
const MemberPrayer = lazy(() => import('./pages/member/MemberPrayer'));
const MemberSermons = lazy(() => import('./pages/member/MemberSermons'));
const MemberDirectory = lazy(() => import('./pages/member/MemberDirectory'));
const MemberAttendance = lazy(() => import('./pages/member/MemberAttendance'));
const Churches = lazy(() => import('./pages/Churches'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const Users = lazy(() => import('./pages/Users'));
const Communication = lazy(() => import('./pages/Communication'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Billing = lazy(() => import('./pages/Billing'));
const Tickets = lazy(() => import('./pages/Tickets'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Unauthorized = lazy(() => import('./pages/Unauthorized'));
const ChurchDashboard = lazy(() => import('./pages/church/Dashboard').then(module => ({ default: module.Dashboard })));
const MemberList = lazy(() => import('./pages/church/MemberList').then(module => ({ default: module.MemberList })));
const ChurchSettingsPage = lazy(() => import('./pages/church/Settings'));
const MemberEngagementPage = lazy(() => import('./pages/church/MemberEngagement'));
const UnitStatisticsPage = lazy(() => import('./pages/church/UnitStatistics'));
const ChurchRegistersPage = lazy(() => import('./pages/church/Registers'));
const ChurchConfigurationPage = lazy(() => import('./pages/ChurchConfiguration'));
const AbsenceSurveyPage = lazy(() => import('./pages/AbsenceSurvey'));
const ActivateAccountPage = lazy(() => import('./pages/ActivateAccount'));
const ChurchEventsPage = lazy(() => import('./pages/church/Events'));
const ChurchCommunicationPage = lazy(() => import('./pages/church/Communication'));
const ChurchAttendancePage = lazy(() => import('./pages/church/Attendance'));
const ChurchVisitorsPage = lazy(() => import('./pages/church/Visitors'));
const ChurchMinistriesPage = lazy(() => import('./pages/church/Ministries'));
const FinanceDashboard = lazy(() => import('./pages/finance/FinanceDashboard'));
const FinanceLedger = lazy(() => import('./pages/finance/FinanceLedger'));
const FinanceSection = lazy(() => import('./pages/finance/FinanceSection'));
const ChurchFinancePage = lazy(() => import('./pages/church/Finance'));
const ChurchUsersPage = lazy(() => import('./pages/church/UsersPermissions'));
const ChurchPositionsPage = lazy(() => import('./pages/church/Positions'));
const ChurchReportsPage = lazy(() => import('./pages/church/Reports'));
const ChurchSmsBundlesPage = lazy(() => import('./pages/church/SmsBundles'));
const ChurchAuditPage = lazy(() => import('./pages/church/AuditSecurity'));

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrandingProvider>
      <Router>
        <RoleSyncRedirect />
        <Suspense fallback={<div role="status" style={{ padding: 32 }}>Loading portal…</div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/*
            Absence questionnaire. Deliberately outside ProtectedRoute: the
            member who receives the SMS/email link is not signed in, and the
            unguessable token in the URL is what authorises the page.
          */}
          <Route path="/absence-survey/:token" element={<AbsenceSurveyPage />} />

          {/*
            Member account activation, from the link in the welcome email.
            Outside ProtectedRoute for the same reason: the member cannot sign
            in until this page has done its job.
          */}
          <Route path="/activate/:token" element={<ActivateAccountPage />} />

          {/* Super Admin Routes */}
          <Route path="/super-admin" element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']}><SuperAdminLayout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="churches" element={<Churches />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="users" element={<Users />} />
            <Route path="communication" element={<Communication />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="billing" element={<Billing />} />
            <Route path="tickets" element={<Tickets />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="audit" element={<PlatformAudit />} />
            {/* SMS, email, gateway, integrations and backup, per church. */}
            <Route path="church-settings" element={<ChurchConfigurationPage />} />
          </Route>

          {/*
            Land people according to their actual role. These two paths used to
            redirect unconditionally to /super-admin, which pushed every visitor
            into the platform-admin area and produced a 403 wall for anyone who
            was not a super admin, with no route back to the login screen.
          */}
          <Route path="/dashboard" element={<RoleLanding />} />
          <Route path="/" element={<RoleLanding />} />

          {/* Church Admin Routes */}
          <Route element={<ProtectedRoute allowedRoles={['CHURCH_ADMIN']}><ChurchAdminLayout /></ProtectedRoute>}>
            <Route path="/church/dashboard" element={<ChurchDashboard />} />
            <Route path="/church/sermons" element={<Sermons />} />
            <Route path="/church/members" element={<MemberList />} />
            <Route path="/church/visitors" element={<ChurchVisitorsPage />} />
            <Route path="/church/attendance" element={<ChurchAttendancePage />} />
            <Route path="/church/ministries" element={<ChurchMinistriesPage />} />
            <Route path="/church/events" element={<ChurchEventsPage />} />
            <Route path="/church/finances" element={<ChurchFinancePage />} />
            <Route path="/church/communication" element={<ChurchCommunicationPage />} />
            <Route path="/church/sms-bundles" element={<ChurchSmsBundlesPage />} />
            <Route path="/church/users" element={<ChurchUsersPage />} />
            <Route path="/church/positions" element={<ChurchPositionsPage />} />
            <Route path="/church/reports" element={<ChurchReportsPage />} />
            <Route path="/church/audit" element={<ChurchAuditPage />} />
            <Route path="/church/registers" element={<ChurchRegistersPage />} />
            <Route path="/church/statistics" element={<UnitStatisticsPage />} />
            <Route path="/church/engagement" element={<MemberEngagementPage />} />
            <Route path="/church/settings" element={<ChurchSettingsPage />} />
            <Route path="/church" element={<Navigate to="/church/dashboard" replace />} />
          </Route>

          {/* Pastor Portal */}
          <Route element={<ProtectedRoute allowedRoles={['PASTOR', 'CHURCH_ADMIN']}><PastorLayout /></ProtectedRoute>}>
            <Route path="/pastor/dashboard" element={<PastorDashboard />} />
            <Route path="/pastor/members" element={<PastorMemberCare />} />
            <Route path="/pastor/prayers" element={<PastorPrayers />} />
            <Route path="/pastor/visitation" element={<PastorVisitation />} />
            <Route path="/pastor/counseling" element={<PastorCounseling />} />
            <Route path="/pastor/reports" element={<PastorReports />} />
            <Route path="/pastor/communication" element={<PastorCommunication />} />
            <Route path="/pastor" element={<Navigate to="/pastor/dashboard" replace />} />
          </Route>

          {/* Ministry Leader Portal */}
          <Route element={<ProtectedRoute allowedRoles={['MINISTRY_LEADER', 'PASTOR', 'CHURCH_ADMIN']}><MinistryLeaderLayout /></ProtectedRoute>}>
            <Route path="/ministry/dashboard" element={<MinistryDashboard />} />
            <Route path="/ministry/members" element={<MinistryMembers />} />
            <Route path="/ministry/tasks" element={<MinistryTasks />} />
            <Route path="/ministry/events" element={<MinistryEvents />} />
            <Route path="/ministry/communication" element={<MinistryCommunication />} />
            <Route path="/ministry/reports" element={<MinistryReports />} />
            <Route path="/ministry" element={<Navigate to="/ministry/dashboard" replace />} />
          </Route>

          <Route path="/group-leader" element={<ProtectedRoute allowedRoles={['GROUP_LEADER', 'CHURCH_ADMIN', 'PASTOR']}><GroupLeaderLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<GroupLeaderPortal />} />
            <Route path="members" element={<GroupLeaderPortal initialTab={0} />} />
            <Route path="attendance" element={<GroupLeaderPortal initialTab={1} />} />
            <Route path="followups" element={<GroupLeaderPortal initialTab={2} />} />
            <Route path="statistics" element={<GroupLeaderPortal initialTab={3} />} />
            <Route path="communication" element={<GroupLeaderPortal initialTab={4} />} />
          </Route>

          {/* Member Portal */}
          <Route element={<ProtectedRoute allowedRoles={['MEMBER', 'GROUP_LEADER', 'MINISTRY_LEADER', 'PASTOR', 'CHURCH_ADMIN']}><MemberLayout /></ProtectedRoute>}>
            <Route path="/member/dashboard" element={<MemberDashboard />} />
            <Route path="/member/profile" element={<MemberProfile />} />
            <Route path="/member/giving" element={<MemberGiving />} />
            <Route path="/member/events" element={<MemberEvents />} />
            <Route path="/member/groups" element={<MemberGroups />} />
            <Route path="/member/prayer" element={<MemberPrayer />} />
            <Route path="/member/sermons" element={<MemberSermons />} />
            <Route path="/member/directory" element={<MemberDirectory />} />
            <Route path="/member/attendance" element={<MemberAttendance />} />
            <Route path="/member" element={<Navigate to="/member/dashboard" replace />} />
          </Route>

          {/*
            Finance Portal

            Reuses the church finance and reports screens. A finance officer may
            record giving and manage expenses, budgets and pledges; the server
            grants FINANCE write access to exactly those tables and nothing else.
          */}
          <Route element={<ProtectedRoute allowedRoles={['FINANCE', 'CHURCH_ADMIN', 'PASTOR']}><FinanceLayout /></ProtectedRoute>}>
            <Route path="/finance/dashboard" element={<FinanceDashboard />} />
            <Route path="/finance/transactions" element={<FinanceLedger />} />
            <Route path="/finance/invoices" element={<FinanceDocuments key="invoices" initialDocument="invoice" />} />
            <Route path="/finance/giving" element={<FinanceSection name="giving" />} />
            <Route path="/finance/dues" element={<FinanceSection name="dues" />} />
            <Route path="/finance/pledges" element={<FinanceSection name="pledges" />} />
            <Route path="/finance/expenses" element={<FinanceSection name="expenses" />} />
            <Route path="/finance/budgets" element={<FinanceSection name="budgets" />} />
            <Route path="/finance/inventory" element={<FinanceSection name="inventory" />} />
            <Route path="/finance/charges" element={<FinanceSection name="charges" />} />
            <Route path="/finance/purposes" element={<FinanceSection name="purposes" />} />
            <Route path="/finance/reports" element={<FinanceDocuments key="reports" />} />
            <Route path="/finance" element={<Navigate to="/finance/dashboard" replace />} />
          </Route>

          {/*
            Secretary Portal

            The secretary overview links directly to attendance and records. SECRETARY is included in ATTENDANCE_ROLES on
            the server, so the QR, roll-call and biometric tabs all work here.
          */}
          <Route element={<ProtectedRoute allowedRoles={['SECRETARY', 'CHURCH_ADMIN', 'PASTOR']}><SecretaryLayout /></ProtectedRoute>}>
            <Route path="/secretary/dashboard" element={<SecretaryDashboard />} />
            <Route path="/secretary/attendance" element={<ChurchAttendancePage />} />
            <Route path="/secretary/members" element={<MemberList />} />
            <Route path="/secretary/visitors" element={<ChurchVisitorsPage />} />
            <Route path="/secretary/events" element={<ChurchEventsPage />} />
            <Route path="/secretary" element={<Navigate to="/secretary/dashboard" replace />} />
          </Route>

          {/* Fallback routes */}
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </Suspense>
      </Router>
      </BrandingProvider>
    </AuthProvider>
  );
};

export default App;
