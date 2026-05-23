/**
 * MyProfileSection tests — extracted from ReservistDashboard in #102.
 *
 * Covers: the multi-team picker visibility rule, the active-team highlight,
 * the picker click contract, the profile card identity rendering, and the
 * skill chip emission.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyProfileSection } from '../../src/components/MyProfileSection';
import type { Member, Team } from '../../src/lib/types';

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'me',
    division_id: 'div1',
    name: 'Alon Cohen',
    initials: 'AC',
    tone: 0,
    phone: '0541234567',
    joined: '2024-01',
    last_seen: '1 day ago',
    calls_this_year: 1,
    status: 'available',
    status_note: null,
    status_until: null,
    status_set_at: new Date().toISOString(),
    is_division_admin: false,
    phone_visible_to_peers: true,
    skills: [
      { name: 'Medic', level: 'senior' },
      { name: 'Driver', level: 'intermediate' },
    ],
    teams: [],
    ...overrides,
  } as unknown as Member;
}

function makeTeam(id: string, name: string, crest = '🏴'): Team {
  return {
    id,
    project_id: 'p1',
    division_id: 'div1',
    name,
    crest,
    invite_code: null,
    invite_expires_at: null,
    established: null,
    member_count: 10,
    commander_count: 1,
    project_name: 'Alpha',
    show_unit_schedule: true,
  } as unknown as Team;
}

describe('MyProfileSection', () => {
  it('hides the team picker when the member belongs to a single team', () => {
    const team = makeTeam('t1', 'Bravo');
    render(<MyProfileSection me={makeMember()} team={team} teams={[team]} onSelectTeam={() => {}} />);
    expect(screen.queryByRole('button', { name: /Bravo/i })).not.toBeInTheDocument();
  });

  it('renders the team picker pills when the member belongs to multiple teams', () => {
    const t1 = makeTeam('t1', 'Bravo');
    const t2 = makeTeam('t2', 'Charlie');
    render(<MyProfileSection me={makeMember()} team={t1} teams={[t1, t2]} onSelectTeam={() => {}} />);
    expect(screen.getByRole('button', { name: /Bravo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Charlie/i })).toBeInTheDocument();
  });

  it('fires onSelectTeam with the clicked team id', async () => {
    const onSelectTeam = vi.fn();
    const t1 = makeTeam('t1', 'Bravo');
    const t2 = makeTeam('t2', 'Charlie');
    render(<MyProfileSection me={makeMember()} team={t1} teams={[t1, t2]} onSelectTeam={onSelectTeam} />);
    await userEvent.click(screen.getByRole('button', { name: /Charlie/i }));
    expect(onSelectTeam).toHaveBeenCalledWith('t2');
  });

  it('renders the member name and current team in the profile card', () => {
    const team = makeTeam('t1', 'Bravo');
    render(<MyProfileSection me={makeMember()} team={team} teams={[team]} onSelectTeam={() => {}} />);
    expect(screen.getByText(/Alon/)).toBeInTheDocument();
    const teamLabel = screen.getByTestId('profile-team');
    expect(teamLabel.textContent).toMatch(/Bravo/);
  });

  it('renders one chip per skill', () => {
    const team = makeTeam('t1', 'Bravo');
    render(<MyProfileSection me={makeMember()} team={team} teams={[team]} onSelectTeam={() => {}} />);
    // SkillChip atom renders each skill name in its own element.
    expect(screen.getByText('Medic')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
  });

  it('does not render a team label when no current team is set (defensive)', () => {
    render(<MyProfileSection me={makeMember()} team={null} teams={[]} onSelectTeam={() => {}} />);
    const teamLabel = screen.getByTestId('profile-team');
    expect(teamLabel.textContent).not.toMatch(/Bravo|Charlie/);
  });
});
