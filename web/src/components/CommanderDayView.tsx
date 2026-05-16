import { useState } from 'react';
import { Avatar, StatusPill, Tag } from './atoms';
import { Icon } from './Icon';
import { useUnitDayAggregate } from '../lib/queries';
import { isoDay } from '../lib/calendarUtils';

interface Props {
  unitId: string;
}

export function CommanderDayView({ unitId }: Props) {
  const [dateISO, setDateISO] = useState<string>(() => isoDay(new Date()));
  const { data, isLoading, error } = useUnitDayAggregate(unitId, dateISO);

  return (
    <div className="day-view">
      <div className="day-view-header">
        <div className="day-view-picker-wrap">
          <Icon name="calendar" size={14} />
          <input
            type="date"
            className="day-view-date-input"
            value={dateISO}
            onChange={(e) => {
              if (e.target.value) setDateISO(e.target.value);
            }}
            aria-label="Select date"
          />
        </div>
        <div className="day-view-count">
          {!isLoading && !error && (
            <span>
              <strong>{data?.length ?? 0}</strong>{' '}
              {(data?.length ?? 0) === 1 ? 'member' : 'members'} on duty
            </span>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="day-view-empty">Loading…</div>
      )}

      {error && (
        <div className="day-view-error">
          <Icon name="urgent" size={14} />
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (data == null || data.length === 0) && (
        <div className="day-view-empty">
          <Icon name="calendar" size={24} />
          <p>No members on duty for this date.</p>
        </div>
      )}

      {!isLoading && !error && data && data.length > 0 && (
        <ul className="day-view-list" role="list">
          {data.map((member) => (
            <li key={member.memberId} className="day-view-row">
              <Avatar
                initials={member.initials}
                tone={member.tone}
                status={member.status}
                size="md"
              />
              <div className="day-view-row-body">
                <div className="day-view-row-top">
                  <span className="day-view-name">{member.memberName}</span>
                  <StatusPill status={member.status} />
                </div>
                <div className="day-view-reasons">
                  {member.reasons.map((reason, i) =>
                    reason.kind === 'pick' ? (
                      <Tag key={`pick-${i}`} tone="accent">
                        Deployment pick
                      </Tag>
                    ) : (
                      <Tag key={`slot-${i}`}>
                        Slot: {reason.slotTitle}
                      </Tag>
                    ),
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
