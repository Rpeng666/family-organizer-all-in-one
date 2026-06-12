// Re-export the store functions so consumers can import from 'registry'
export { registerWidget, getWidget, getAllWidgets, getDefaultWidgetOrder, getDefaultDisabledWidgets } from './widget-store';

// Import all widget modules to trigger self-registration.
// These must come AFTER the re-exports so the store is initialized before widgets call registerWidget.
import './XPBarWidget';
import './TodaysChoresWidget';
import './TodaysTasksWidget';
import './CalendarEventsWidget';
import './MiniCalendarWidget';
import './UnreadMessagesWidget';
import './BalancesWidget';
import './UpcomingChoresWidget';
import './RecentActivityWidget';
