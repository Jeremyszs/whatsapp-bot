const fs = require('fs');
const path = require('path');

class ReminderManager {
    constructor() {
        this.remindersFile = path.join(__dirname, 'reminders.json');
        this.reminders = this.loadReminders();
    }

    // Load reminders from JSON file
    loadReminders() {
        try {
            if (fs.existsSync(this.remindersFile)) {
                const data = fs.readFileSync(this.remindersFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading reminders:', error);
        }
        return {};
    }

    // Save reminders to JSON file
    saveReminders() {
        try {
            fs.writeFileSync(this.remindersFile, JSON.stringify(this.reminders, null, 2));
            console.log('Reminders saved successfully');
        } catch (error) {
            console.error('Error saving reminders:', error);
        }
    }

    // Generate unique reminder ID
    generateId() {
        return 'https://'+ Date.now().toString() + Math.random().toString(36).substr(2, 9) + '.sz';
    }

    // Add daily reminder
    addDailyReminder(userId, time, message) {
        const [hours, minutes] = time.split(':');
        if (!this.isValidTime(hours, minutes)) {
            return { success: false, error: 'Invalid time format. Use HH:MM (24-hour format)' };
        }

        if (!this.reminders[userId]) {
            this.reminders[userId] = [];
        }

        const reminder = {
            id: this.generateId(),
            type: 'daily',
            time: time,
            message: message,
            createdAt: new Date().toISOString()
        };

        this.reminders[userId].push(reminder);
        this.saveReminders();

        return { success: true, id: reminder.id };
    }

    // Add monthly reminder
    addMonthlyReminder(userId, date, time, message) {
        const [hours, minutes] = time.split(':');
        if (!this.isValidTime(hours, minutes)) {
            return { success: false, error: 'Invalid time format. Use HH:MM (24-hour format)' };
        }

        if (!this.isValidDate(date)) {
            return { success: false, error: 'Invalid date. Use 1-31' };
        }

        if (!this.reminders[userId]) {
            this.reminders[userId] = [];
        }

        const reminder = {
            id: this.generateId(),
            type: 'monthly',
            date: parseInt(date),
            time: time,
            message: message,
            createdAt: new Date().toISOString()
        };

        this.reminders[userId].push(reminder);
        this.saveReminders();

        return { success: true, id: reminder.id };
    }

    // Add one-time reminder
    addOneTimeReminder(userId, day, month, time, message) {
        const [hours, minutes] = time.split(':');
        if (!this.isValidTime(hours, minutes)) {
            return { success: false, error: 'Invalid time format. Use HH:MM (24-hour format)' };
        }

        if (!this.isValidDate(day)) {
            return { success: false, error: 'Invalid day. Use 1-31' };
        }

        if (!this.isValidMonth(month)) {
            return { success: false, error: 'Invalid month. Use 1-12' };
        }

        const currentYear = new Date().getFullYear();
        const currentDate = new Date();
        const reminderDate = new Date(currentYear, parseInt(month) - 1, parseInt(day));
        
        // Only set to next year if the date has completely passed (not just today)
        const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        const reminderDateOnly = new Date(reminderDate.getFullYear(), reminderDate.getMonth(), reminderDate.getDate());
        
        if (reminderDateOnly < today) {
            reminderDate.setFullYear(currentYear + 1);
        }

        if (!this.reminders[userId]) {
            this.reminders[userId] = [];
        }

        const reminder = {
            id: this.generateId(),
            type: 'once',
            day: parseInt(day),
            month: parseInt(month),
            year: reminderDate.getFullYear(),
            time: time,
            message: message,
            createdAt: new Date().toISOString()
        };

        this.reminders[userId].push(reminder);
        this.saveReminders();

        return { success: true, id: reminder.id };
    }

    // Get all reminders for a user
    getUserReminders(userId) {
        return this.reminders[userId] || [];
    }

    // Delete a reminder
    deleteReminder(userId, reminderId) {
        if (!this.reminders[userId]) {
            return { success: false, error: 'No reminders found for user, please use format as !delremind https://<ID>.sz' };
        }

        const index = this.reminders[userId].findIndex(r => r.id === reminderId);
        if (index === -1) {
            return { success: false, error: 'Reminder not found' };
        }

        this.reminders[userId].splice(index, 1);
        this.saveReminders();

        return { success: true };
    }

    // Check for due reminders
    checkDueReminders() {
        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2, '0');
        const currentMinute = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${currentHour}:${currentMinute}`;
        const currentDate = now.getDate();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        const dueReminders = [];

        for (const userId in this.reminders) {
            for (let i = this.reminders[userId].length - 1; i >= 0; i--) {
                const reminder = this.reminders[userId][i];
                let isDue = false;

                switch (reminder.type) {
                    case 'daily':
                        if (reminder.time === currentTime) {
                            isDue = true;
                        }
                        break;

                    case 'monthly':
                        if (reminder.date === currentDate && reminder.time === currentTime) {
                            isDue = true;
                        }
                        break;

                    case 'once':
                        if (reminder.day === currentDate && 
                            reminder.month === currentMonth && 
                            reminder.year === currentYear && 
                            reminder.time === currentTime) {
                            isDue = true;
                            // Remove one-time reminder after triggering
                            this.reminders[userId].splice(i, 1);
                            this.saveReminders();
                        }
                        break;
                }

                if (isDue) {
                    dueReminders.push({
                        userId: userId,
                        message: reminder.message,
                        type: reminder.type
                    });
                }
            }
        }

        return dueReminders;
    }

    // Validation helpers
    isValidTime(hours, minutes) {
        const h = parseInt(hours);
        const m = parseInt(minutes);
        return h >= 0 && h <= 23 && m >= 0 && m <= 59;
    }

    isValidDate(date) {
        const d = parseInt(date);
        return d >= 1 && d <= 31;
    }

    isValidMonth(month) {
        const m = parseInt(month);
        return m >= 1 && m <= 12;
    }

    // Format reminder for display
    formatReminder(reminder) {
        let timeInfo = '';
        switch (reminder.type) {
            case 'daily':
                timeInfo = `Daily at ${reminder.time}`;
                break;
            case 'monthly':
                timeInfo = `Monthly on ${reminder.date} at ${reminder.time}`;
                break;
            case 'once':
                timeInfo = `Once on ${reminder.day}/${reminder.month}/${reminder.year} at ${reminder.time}`;
                break;
        }
        return `ID: ${reminder.id}\nType: ${timeInfo}\nMessage: ${reminder.message}\nCreated: ${new Date(reminder.createdAt).toLocaleDateString()}`;
    }
}

module.exports = ReminderManager;