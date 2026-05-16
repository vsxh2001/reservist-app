import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import { PrefsProvider } from './lib/prefs';
import { TeamProvider, useActiveTeam } from './lib/team-context';
import { LoginPicker } from './components/LoginPicker';
import { ClaimProfileScreen } from './components/ClaimProfileScreen';
import { JoinScreen } from './components/JoinScreen';
import { Dashboard } from './Dashboard';
import { ReservistDashboard } from './ReservistDashboard';
import { useMyMember } from './lib/queries';
import { ErrorBoundary } from './components/ErrorBoundary';

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } },
});

function readJoinCode(): string | null {
  const p = new URLSearchParams(window.location.search);
  const q = p.get('join');
  if (q) return q;
  const m = window.location.pathname.match(/^\/join\/([^/]+)$/);
  return m ? m[1] : null;
}

function RoleRouter() {
  const { user } = useAuth();
  const me = useMyMember(user?.id);
  const { team } = useActiveTeam();
  // Commander can force-view reservist surface
  const [forceReservist, setForceReservist] = useState<boolean>(
    () => sessionStorage.getItem('viewAsReservist') === '1',
  );

  useEffect(() => {
    sessionStorage.setItem('viewAsReservist', forceReservist ? '1' : '0');
  }, [forceReservist]);

  if (me.isLoading) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--ink-soft)' }}>Loading profile…</div>;
  }
  if (!me.data) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--ink-soft)' }}>Profile not found.</div>;
  }
  const isCommanderOfActiveTeam = team
    ? me.data.teams.some((t) => t.team_id === team.id && t.role === 'commander')
    : false;
  const showCommander = isCommanderOfActiveTeam && !forceReservist;
  return showCommander
    ? <Dashboard onSwitchToReservist={() => setForceReservist(true)} />
    : <ReservistDashboard
        onSwitchView={isCommanderOfActiveTeam ? () => setForceReservist(false) : undefined}
      />;
}

function Gate() {
  const { status } = useAuth();
  const [joinCode, setJoinCode] = useState<string | null>(() => readJoinCode());

  useEffect(() => {
    const onPop = () => setJoinCode(readJoinCode());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (joinCode) {
    return <JoinScreen code={joinCode} onCancel={() => {
      window.history.pushState({}, '', '/');
      setJoinCode(null);
    }} />;
  }

  if (status === 'loading') {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--ink-soft)' }}>Loading…</div>;
  }
  if (status === 'no-session') return <LoginPicker />;
  if (status === 'no-link') return <ClaimProfileScreen />;
  return <RoleRouter />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <PrefsProvider>
        <AuthProvider>
          <ErrorBoundary>
            <TeamProvider>
              <Gate />
            </TeamProvider>
          </ErrorBoundary>
        </AuthProvider>
      </PrefsProvider>
    </QueryClientProvider>
  );
}
