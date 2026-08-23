import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { BrandingProvider } from './contexts/BrandingContext';
import ProtectedRoute from './components/ProtectedRoute';
import SuperAdminLayout from './layouts/SuperAdminLayout';
import { ChurchAdminLayout } from './layouts/ChurchAdminLayout';
import LoginPage from './pages/LoginPage';
import RoleLanding from './components/RoleLanding';
import Dashboard from './pages/Dashboard';

// Portal Layouts (Pastor / Ministry Leader / Member)
import PastorLayout from './layouts/PastorLayout';
import MinistryLeaderLayout from './layouts/MinistryLeaderLayout';
import MemberLayout from './layouts/MemberLayout';
import FinanceLayout from './layouts/FinanceLayout';
import SecretaryLayout from './layouts/SecretaryLayout';

// Portal Dashboards
import PastorDashboard from './pages/pastor/PastorDashboard';
import PastorPrayers from './pages/pastor/PastorPrayers';
import PastorVisitation from './pages/pastor/PastorVisitation';
import PastorCounseling from './pages/pastor/PastorCounseling';
import PastorMemberCare from './pages/pastor/PastorMemberCare';
import PastorReports from './pages/pastor/PastorReports';
import PastorCommunication from './pages/pastor/PastorCommunication';
import MinistryDashboard from './pages/ministry/MinistryDashboard';
import MinistryMembers from './pages/ministry/MinistryMembers';
import MinistryTasks from './pages/ministry/MinistryTasks';
import MinistryEvents from './pages/ministry/MinistryEvents';
import MinistryReports from './pages/ministry/MinistryReports';
import MinistryCommunication from './pages/ministry/MinistryCommunication';
import MemberDashboard from './pages/member/MemberDashboard';
import MemberGiving from './pages/member/MemberGiving';
import MemberEvents from './pages/member/MemberEvents';
import MemberProfile from './pages/member/MemberProfile';
import MemberGroups from './pages/member/MemberGroups';
import MemberPrayer from './pages/member/MemberPrayer';
import MemberSermons from './pages/member/MemberSermons';
import MemberDirectory from './pages/member/MemberDirectory';
import MemberAttendance from './pages/member/MemberAttendance';
import Churches from './pages/Churches';
import Subscriptions from './pages/Subscriptions';
import Users from './pages/Users';
import Communication from './pages/Communication';
import Analytics from './pages/Analytics';
import Billing from './pages/Billing';
import Tickets from './pages/Tickets';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Unauthorized from './pages/Unauthorized';

// Church Admin Pages
import { Dashboard as ChurchDashboard } from './pages/church/Dashboard';
import { MemberList } from './pages/church/MemberList';
import ChurchSettingsPage from './pages/church/Settings';
import MemberEngagementPage from './pages/church/MemberEngagement';
import UnitStatisticsPage from './pages/church/UnitStatistics';
import ChurchRegistersPage from './pages/church/Registers';
import ChurchConfigurationPage from './pages/ChurchConfiguration';
import AbsenceSurveyPage from './pages/AbsenceSurvey';
import ActivateAccountPage from './pages/ActivateAccount';
import ChurchEventsPage from './pages/church/Events';
import ChurchCommunicationPage from './pages/church/Communication';
import ChurchAttendancePage from './pages/church/Attendance';
import ChurchVisitorsPage from './pages/church/Visitors';
import ChurchMinistriesPage from './pages/church/Ministries';
import ChurchFinancePage from './pages/church/Finance';
import ChurchUsersPage from './pages/church/UsersPermissions';
import ChurchPositionsPage from './pages/church/Positions';
import ChurchReportsPage from './pages/church/Reports';
import ChurchSmsBundlesPage from './pages/church/SmsBundles';
import ChurchAuditPage from './pages/church/AuditSecurity';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrandingProvider>
      <Router>
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

          {/* Member Portal */}
          <Route element={<ProtectedRoute allowedRoles={['MEMBER', 'MINISTRY_LEADER', 'PASTOR', 'CHURCH_ADMIN']}><MemberLayout /></ProtectedRoute>}>
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
            <Route path="/finance/dashboard" element={<ChurchFinancePage />} />
            <Route path="/finance/reports" element={<ChurchReportsPage />} />
            <Route path="/finance" element={<Navigate to="/finance/dashboard" replace />} />
          </Route>

          {/*
            Secretary Portal

            Attendance is the landing screen because marking the roll is the
            secretary's core task. SECRETARY is included in ATTENDANCE_ROLES on
            the server, so the QR, roll-call and biometric tabs all work here.
          */}
          <Route element={<ProtectedRoute allowedRoles={['SECRETARY', 'CHURCH_ADMIN', 'PASTOR']}><SecretaryLayout /></ProtectedRoute>}>
            <Route path="/secretary/dashboard" element={<ChurchAttendancePage />} />
            <Route path="/secretary/members" element={<MemberList />} />
            <Route path="/secretary/visitors" element={<ChurchVisitorsPage />} />
            <Route path="/secretary/events" element={<ChurchEventsPage />} />
            <Route path="/secretary" element={<Navigate to="/secretary/dashboard" replace />} />
          </Route>

          {/* Fallback routes */}
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
      </BrandingProvider>
    </AuthProvider>
  );
};

export default App;
