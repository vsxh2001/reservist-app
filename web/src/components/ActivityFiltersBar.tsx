import { Button } from './atoms';

export interface ActivityFiltersBarProps {
  /** Free-text "contains" filter over actor names. */
  actorQuery: string;
  onActorQueryChange: (s: string) => void;
  /** All distinct verbs present in current data, in stable order. */
  availableVerbs: string[];
  /** Currently-selected verbs (multi-select). Empty array = no verb filter. */
  selectedVerbs: string[];
  onToggleVerb: (verb: string) => void;
  /** Inclusive date bounds in "YYYY-MM-DD" format; empty string = unbounded. */
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (s: string) => void;
  onDateToChange: (s: string) => void;
  /** Reset everything to defaults. Only rendered when `hasActiveFilters` is true. */
  onClear: () => void;
  hasActiveFilters: boolean;
  /** Counts shown after the filter chips. */
  visibleCount: number;
  totalCount: number;
  /** "Download CSV" button — disabled when there is nothing to export. */
  onDownloadCSV: () => void;
}

/**
 * Filter bar for the activity-log screen.
 *
 * Layout mirrors the rest of the app's `filters` / `filter-group` styling so
 * we don't introduce any new design tokens.
 */
export function ActivityFiltersBar({
  actorQuery,
  onActorQueryChange,
  availableVerbs,
  selectedVerbs,
  onToggleVerb,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClear,
  hasActiveFilters,
  visibleCount,
  totalCount,
  onDownloadCSV,
}: ActivityFiltersBarProps) {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--card)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div className="filters" style={{ marginBottom: 0 }}>
        <input
          className="input"
          type="text"
          placeholder="Filter by actor…"
          value={actorQuery}
          onChange={(e) => onActorQueryChange(e.target.value)}
          aria-label="Filter by actor"
          style={{ maxInlineSize: 200 }}
        />

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--ink-mute)',
          }}
        >
          From
          <input
            className="input"
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            aria-label="From date"
          />
        </label>

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--ink-mute)',
          }}
        >
          To
          <input
            className="input"
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            aria-label="To date"
          />
        </label>

        {hasActiveFilters && (
          <button className="filter-clear" onClick={onClear}>
            Clear
          </button>
        )}

        <span
          style={{
            marginInlineStart: 'auto',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--ink-soft)',
          }}
        >
          {visibleCount} / {totalCount}
        </span>

        <Button
          size="sm"
          variant="ghost"
          icon="copy"
          disabled={visibleCount === 0}
          onClick={onDownloadCSV}
        >
          Download CSV
        </Button>
      </div>

      {availableVerbs.length > 0 && (
        <div className="filter-group" role="group" aria-label="Filter by verb">
          {availableVerbs.map((v) => (
            <button
              key={v}
              data-on={selectedVerbs.includes(v) ? '1' : '0'}
              onClick={() => onToggleVerb(v)}
              type="button"
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
