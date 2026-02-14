// Utility functions for task management

function formatDateForDisplay(dateString) {
    // Convert DD/MM/YYYY to a more readable format
    if (!dateString || dateString === 'F') return '';
    
    try {
        const [day, month, year] = dateString.split('/');
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (error) {
        console.error('Error formatting date:', error);
        return dateString;
    }
}

function formatDateForInput(dateString) {
    // Convert DD/MM/YYYY to YYYY-MM-DD (HTML input date format)
    if (!dateString || dateString === 'F') return '';
    
    try {
        const [day, month, year] = dateString.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } catch (error) {
        console.error('Error formatting date for input:', error);
        return '';
    }
}

function getPriorityColor(priority) {
    switch (priority.toLowerCase()) {
        case 'high':
            return '#e74c3c';
        case 'medium':
            return '#f39c12';
        case 'low':
            return '#2ecc71';
        default:
            return '#95a5a6';
    }
}

function getTagColor(tag) {
    switch (tag.toLowerCase()) {
        case 'study':
            return '#9b59b6';
        case 'work':
            return '#3498db';
        case 'read':
            return '#2ecc71';
        default:
            return '#95a5a6';
    }
}

function formatTimeRange(startTime, endTime) {
    if (!startTime || !endTime || startTime === 'F' || endTime === 'F') {
        return '';
    }
    
    try {
        const formatTime = (timeStr) => {
            const [hours, minutes] = timeStr.split(':');
            const hour = parseInt(hours);
            const period = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12;
            return `${displayHour}:${minutes} ${period}`;
        };
        
        return `${formatTime(startTime)} - ${formatTime(endTime)}`;
    } catch (error) {
        console.error('Error formatting time range:', error);
        return `${startTime} - ${endTime}`;
    }
}

function calculateTaskDuration(startTime, endTime) {
    if (!startTime || !endTime || startTime === 'F' || endTime === 'F') {
        return 0;
    }
    
    try {
        const [startHours, startMinutes] = startTime.split(':').map(Number);
        const [endHours, endMinutes] = endTime.split(':').map(Number);
        
        const startMinutesSinceMidnight = startHours * 60 + startMinutes;
        const endMinutesSinceMidnight = endHours * 60 + endMinutes;
        
        // Handle case where end time is on the next day
        const durationMinutes = endMinutesSinceMidnight >= startMinutesSinceMidnight 
            ? endMinutesSinceMidnight - startMinutesSinceMidnight
            : (24 * 60) - startMinutesSinceMidnight + endMinutesSinceMidnight;
        
        return durationMinutes / 60; // Return duration in hours
    } catch (error) {
        console.error('Error calculating task duration:', error);
        return 0;
    }
}

function populateTaskForm(task) {
    document.getElementById('taskTitle').value = task.task_title || '';
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskPriority').value = task.priority || 'Medium';
    document.getElementById('taskTag').value = task.tag || 'OTHER';
    document.getElementById('taskTimeRequired').value = task.time_required !== 'F' ? task.time_required : '';
    
    // Format date for HTML date input if it exists
    if (task.schedule_date && task.schedule_date !== 'F') {
        document.getElementById('taskScheduleDate').value = formatDateForInput(task.schedule_date);
    } else {
        document.getElementById('taskScheduleDate').value = '';
    }
    
    // Set time inputs if they exist
    document.getElementById('taskScheduleFrom').value = task.schedule_from !== 'F' ? task.schedule_from : '';
    document.getElementById('taskScheduleTo').value = task.schedule_to !== 'F' ? task.schedule_to : '';
}

// Export functions for other modules to use
window.TaskUtils = {
    formatDateForDisplay,
    formatDateForInput,
    getPriorityColor,
    getTagColor,
    formatTimeRange,
    calculateTaskDuration,
    populateTaskForm
};
