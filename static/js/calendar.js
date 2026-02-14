
// Calendar view functionality

let currentDate = new Date();
let selectedDate = new Date();
let calendarTasks = [];

function initCalendar() {
    updateCalendarHeader();
    renderCalendarDays();
    loadCalendarTasks();

    // Add event listeners for calendar navigation
    document.getElementById('prevMonth').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        updateCalendarHeader();
        renderCalendarDays();
        loadCalendarTasks();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        updateCalendarHeader();
        renderCalendarDays();
        loadCalendarTasks();
    });
}

function updateCalendarHeader() {
    const monthYearText = currentDate.toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
    });
    document.getElementById('currentMonth').textContent = monthYearText;
}

function renderCalendarDays() {
    const calendarDaysElement = document.getElementById('calendarDays');
    calendarDaysElement.innerHTML = '';

    // Get first day of the month
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const startingDayOfWeek = firstDay.getDay(); // 0 (Sunday) to 6 (Saturday)

    // Get last day of the month
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const totalDays = lastDay.getDate();

    // Get days from previous month to fill the first row
    const prevMonthLastDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();

    // Create calendar grid
    // Previous month days
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day other-month';
        dayElement.textContent = prevMonthLastDay - i;
        calendarDaysElement.appendChild(dayElement);
    }

    // Current month days
    const today = new Date();
    for (let i = 1; i <= totalDays; i++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = i;

        // Check if this is today
        if (currentDate.getFullYear() === today.getFullYear() && 
            currentDate.getMonth() === today.getMonth() && 
            i === today.getDate()) {
            dayElement.classList.add('current');
        }

        // Check if this is the selected date
        if (currentDate.getFullYear() === selectedDate.getFullYear() && 
            currentDate.getMonth() === selectedDate.getMonth() && 
            i === selectedDate.getDate()) {
            dayElement.classList.add('selected');
        }

        // Add click event to select date
        dayElement.addEventListener('click', () => {
            // Remove selected class from all days
            document.querySelectorAll('.calendar-day').forEach(day => {
                day.classList.remove('selected');
            });

            // Add selected class to clicked day
            dayElement.classList.add('selected');

            // Update selected date
            selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);

            // Update selected date header
            updateSelectedDateHeader();

            // Show tasks for selected date
            showTasksForSelectedDate();
        });

        calendarDaysElement.appendChild(dayElement);
    }

    // Next month days to fill the remaining grid
    const totalCells = 42; // 6 rows x 7 days
    const remainingCells = totalCells - (startingDayOfWeek + totalDays);

    for (let i = 1; i <= remainingCells; i++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day other-month';
        dayElement.textContent = i;
        calendarDaysElement.appendChild(dayElement);
    }

    // Update day activity wheel
    try {
        const wheelElement = document.getElementById('dayActivityWheel');
        if (wheelElement) {
            renderDayActivityWheel();
        }
    } catch (error) {
        console.log('Day activity wheel not available');
    }
}

function renderDayActivityWheel() {
    const wheelElement = document.getElementById('dayActivityWheel');
    if (!wheelElement) return;

    wheelElement.innerHTML = '';

    // Create 24 segments for 24 hours
    for (let i = 0; i < 24; i++) {
        const segment = document.createElement('div');
        segment.className = 'wheel-segment';
        segment.style.transform = `rotate(${i * 15}deg)`;

        // Add hour text
        const hourText = document.createElement('div');
        hourText.className = 'wheel-hour';
        hourText.textContent = i;

        // Position hour text
        const radius = 90; // Distance from center
        const angle = i * 15 * (Math.PI / 180); // Convert to radians
        hourText.style.left = `calc(50% + ${radius * Math.sin(angle)}px - 10px)`;
        hourText.style.top = `calc(50% - ${radius * Math.cos(angle)}px - 10px)`;

        wheelElement.appendChild(segment);
        wheelElement.appendChild(hourText);
    }
}

async function loadCalendarTasks() {
    try {
        const response = await fetch(`/api/calendar-tasks?month=${currentDate.getMonth() + 1}&year=${currentDate.getFullYear()}`);
        const data = await response.json();

        if (data.success) {
            calendarTasks = data.tasks;
            markCalendarTaskDays();
            showTasksForSelectedDate();
        } else {
            console.error('Error loading calendar tasks:', data.message);
        }
    } catch (error) {
        console.error('Error loading calendar tasks:', error);
    }
}

function markCalendarTaskDays() {
    // Clear all task markers first
    document.querySelectorAll('.calendar-day.has-tasks').forEach(day => {
        day.classList.remove('has-tasks');
    });

    // Mark days with tasks
    calendarTasks.forEach(task => {
        if (task.schedule_date && task.schedule_date !== 'F') {
            try {
                const [day, month, year] = task.schedule_date.split('/').map(Number);

                // Skip if not in the current month/year
                if (month !== currentDate.getMonth() + 1 || year !== currentDate.getFullYear()) {
                    return;
                }

                // Find the day element
                const dayElements = document.querySelectorAll('.calendar-day:not(.other-month)');
                if (day > 0 && day <= dayElements.length) {
                    dayElements[day - 1].classList.add('has-tasks');
                }
            } catch (error) {
                console.error('Error parsing task date:', error);
            }
        }
    });
}

function updateSelectedDateHeader() {
    const dateHeader = document.getElementById('selectedDate');
    if (!dateHeader) return;
    
    dateHeader.textContent = selectedDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long',
        year: 'numeric'
    });
}

function showTasksForSelectedDate() {
    const tasksContainer = document.getElementById('dateTasks');
    if (!tasksContainer) return;
    
    tasksContainer.innerHTML = '';

    // Format selected date to match task format (DD/MM/YYYY)
    const formattedDate = `${selectedDate.getDate().toString().padStart(2, '0')}/${(selectedDate.getMonth() + 1).toString().padStart(2, '0')}/${selectedDate.getFullYear()}`;

    // Filter tasks for the selected date
    const dayTasks = calendarTasks.filter(task => task.schedule_date === formattedDate);

    if (dayTasks.length === 0) {
        tasksContainer.innerHTML = '<div class="text-center text-secondary py-3">No tasks scheduled for this day.</div>';
        return;
    }

    // Sort tasks by start time
    dayTasks.sort((a, b) => {
        if (a.schedule_from === 'F') return 1;
        if (b.schedule_from === 'F') return -1;
        return a.schedule_from.localeCompare(b.schedule_from);
    });

    // Create task elements
    dayTasks.forEach(task => {
        const taskElement = document.createElement('div');
        taskElement.className = `calendar-task ${task.priority.toLowerCase()}-priority`;
        taskElement.setAttribute('data-task-id', task.id);

        let timeDisplay = '';
        if (task.schedule_from && task.schedule_from !== 'F' && task.schedule_to && task.schedule_to !== 'F') {
            timeDisplay = `${task.schedule_from} - ${task.schedule_to}`;
        } else {
            timeDisplay = 'All day';
        }

        taskElement.innerHTML = `
            <h4>${task.task_title}</h4>
            <p>${task.description || 'No description'}</p>
            <div class="task-meta">
                <span class="priority">${task.priority}</span>
                <span class="tag">${task.tag}</span>
                <span class="time">${timeDisplay}</span>
            </div>
        `;

        // Add click event to show task details in modal
        taskElement.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('taskDetailModal'));
            const detailsContent = document.getElementById('taskDetailsContent');
            
            if (detailsContent) {
                detailsContent.innerHTML = `
                    <h4>${task.task_title}</h4>
                    <p>${task.description || 'No description'}</p>
                    <div class="task-meta">
                        <div class="task-priority ${task.priority.toLowerCase()}">${task.priority}</div>
                        <div class="task-tag ${task.tag.toLowerCase()}">${task.tag}</div>
                        ${task.time_required ? `<div class="task-duration">${task.time_required}h</div>` : ''}
                        ${task.schedule_from && task.schedule_from !== 'F' ? 
                            `<div class="task-time">From: ${task.schedule_from}</div>` : ''}
                        ${task.schedule_to && task.schedule_to !== 'F' ? 
                            `<div class="task-time">To: ${task.schedule_to}</div>` : ''}
                    </div>
                `;

                // Update modal buttons with task ID
                document.getElementById('deleteTaskBtn').setAttribute('data-task-id', task.id);
                document.getElementById('completeTaskBtn').setAttribute('data-task-id', task.id);
                document.getElementById('saveReviewBtn').setAttribute('data-task-id', task.id);
            }

            modal.show();
        });

        tasksContainer.appendChild(taskElement);
    });
}

function refreshCalendar() {
    updateCalendarHeader();
    renderCalendarDays();
    loadCalendarTasks();
}

// Export calendar functions for other modules
window.CalendarUtils = {
    initCalendar,
    refreshCalendar
};
