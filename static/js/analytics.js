// Analytics functionality

let completionChart = null;
let priorityChart = null;
let tagChart = null;

function loadAnalyticsData() {
    fetch('/api/analytics')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderAnalytics(data.analytics);
            } else {
                console.error('Error loading analytics:', data.message);
            }
        })
        .catch(error => {
            console.error('Error fetching analytics data:', error);
        });
}

function renderAnalytics(analytics) {
    renderCompletionChart(analytics.completion_rate);
    renderPriorityChart(analytics.priority_distribution);
    renderTagChart(analytics.tag_distribution);
}

function renderCompletionChart(completionRate) {
    const ctx = document.getElementById('completionChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (completionChart) {
        completionChart.destroy();
    }
    
    completionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Completed', 'Pending'],
            datasets: [{
                data: [completionRate, 100 - completionRate],
                backgroundColor: [
                    '#2ecc71', // Green for completed
                    '#e74c3c'  // Red for pending
                ],
                borderColor: [
                    '#27ae60',
                    '#c0392b'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#b0b7c3',
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.raw}%`;
                        }
                    }
                }
            }
        }
    });
}

function renderPriorityChart(priorityData) {
    const ctx = document.getElementById('priorityChart').getContext('2d');
    
    // Transform data for chart
    const labels = [];
    const data = [];
    const backgroundColors = [];
    
    priorityData.forEach(item => {
        labels.push(item.priority || 'Unknown');
        data.push(item.count);
        
        // Set color based on priority
        if (item.priority === 'High') {
            backgroundColors.push('#e74c3c');
        } else if (item.priority === 'Medium') {
            backgroundColors.push('#f39c12');
        } else if (item.priority === 'Low') {
            backgroundColors.push('#2ecc71');
        } else {
            backgroundColors.push('#95a5a6');
        }
    });
    
    // Destroy existing chart if it exists
    if (priorityChart) {
        priorityChart.destroy();
    }
    
    priorityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tasks',
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#b0b7c3'
                    },
                    grid: {
                        color: 'rgba(176, 183, 195, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#b0b7c3'
                    },
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function renderTagChart(tagData) {
    const ctx = document.getElementById('tagChart').getContext('2d');
    
    // Transform data for chart
    const labels = [];
    const data = [];
    const backgroundColors = [];
    
    tagData.forEach(item => {
        labels.push(item.tag || 'Unknown');
        data.push(item.count);
        
        // Set color based on tag
        if (item.tag === 'STUDY') {
            backgroundColors.push('#9b59b6');
        } else if (item.tag === 'WORK') {
            backgroundColors.push('#3498db');
        } else if (item.tag === 'READ') {
            backgroundColors.push('#2ecc71');
        } else {
            backgroundColors.push('#95a5a6');
        }
    });
    
    // Destroy existing chart if it exists
    if (tagChart) {
        tagChart.destroy();
    }
    
    tagChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 1,
                borderColor: '#1e2636'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#b0b7c3',
                        font: {
                            size: 12
                        }
                    }
                }
            }
        }
    });
}

// Initialize mini calendar for summary
function initSummaryCalendar() {
    const summaryCalendar = document.getElementById('summaryCalendar');
    if (!summaryCalendar) return;
    
    const currentDate = new Date();
    const currentMonth = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Create calendar header
    const calendarHeader = document.createElement('div');
    calendarHeader.className = 'calendar-header';
    calendarHeader.innerHTML = `<h6>${currentMonth}</h6>`;
    
    // Create days header
    const daysHeader = document.createElement('div');
    daysHeader.className = 'days-header';
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(day => {
        const dayElement = document.createElement('div');
        dayElement.textContent = day;
        daysHeader.appendChild(dayElement);
    });
    
    // Create calendar days
    const daysContainer = document.createElement('div');
    daysContainer.className = 'calendar-days';
    
    // Get first day of the month
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const startingDayOfWeek = firstDay.getDay(); // 0 (Sunday) to 6 (Saturday)
    
    // Get last day of the month
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const totalDays = lastDay.getDate();
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day other-month';
        daysContainer.appendChild(emptyDay);
    }
    
    // Add days of the month
    for (let i = 1; i <= totalDays; i++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = i;
        
        // Make all dates clickable
        dayElement.classList.add('clickable');
        if (i === currentDate.getDate()) {
            dayElement.classList.add('current');
        }
        dayElement.addEventListener('click', function() {
            document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
            this.classList.add('selected');
            const selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
            generateSummaryForDate(selectedDate);
        });
        
        daysContainer.appendChild(dayElement);
    }
    
    // Append all elements to the calendar
    summaryCalendar.appendChild(calendarHeader);
    summaryCalendar.appendChild(daysHeader);
    summaryCalendar.appendChild(daysContainer);
}

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', function() {
    initSummaryCalendar();
});

// Export analytics functions for other modules
window.AnalyticsUtils = {
    loadAnalyticsData
};
