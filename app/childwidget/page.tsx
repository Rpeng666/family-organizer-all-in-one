import ChildWidget, { type ChildWidgetData } from '@/components/dashboard/ChildWidget';

const demoChildData: ChildWidgetData = {
    name: 'Judah',
    initials: 'J',
    financeLabel: '$83.42',
    xpCurrent: 0,
    xpPossible: 100,
    dueChoresCount: 4,
    dueTasksCount: 3,
    chores: [
        { id: 'c1', title: 'Wash dishes', xp: 100 },
        { id: 'c2', title: 'Science review', xp: 50 },
        { id: 'c3', title: 'Laundry fold', xp: 20 },
        { id: 'c4', title: 'Room reset', xp: 15 },
    ],
    tasks: [
        { id: 't1', title: '9th Grade Science', detail: 'Watch video and write 3 key takeaways.' },
        { id: 't2', title: 'Math Workbook', detail: 'Finish lesson 6 and check answers.' },
        { id: 't3', title: 'Reading Log', detail: 'Read chapter 1 and record notes.' },
    ],
    calendar: [
        { id: 'k1', dateLabel: 'Apr 1', title: 'Piano lesson 4:00 PM' },
        { id: 'k2', dateLabel: 'Apr 2', title: 'Library visit' },
    ],
};

export default function ChildWidgetPage() {
    return (
        <div className="h-full w-full overflow-auto bg-[radial-gradient(circle_at_top_left,_#f8fafc_0%,_#ffffff_65%)] p-4 md:p-8">
            <div className="mx-auto w-full max-w-[1500px]">
                <ChildWidget data={demoChildData} />
            </div>
        </div>
    );
}
