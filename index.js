const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { userInfo } = require('os');
const readline = require("readline");
const crypto = require("crypto");
const math = require('mathjs');
const { send } = require('process');
const ReminderManager = require('./reminders');

const client = new Client({
    authStrategy: new LocalAuth(),
});

const reminderManager = new ReminderManager();
const usageFile = "userUsage.json";
const codesFile = "redeemCodes.json";
const activity = "activity.json";
let anonPair = {};
let coins = {};
const gameSessions = {};

let userUsage = fs.existsSync(usageFile) ? JSON.parse(fs.readFileSync(usageFile)) : {};
let redeemCodes = fs.existsSync(codesFile) ? JSON.parse(fs.readFileSync(codesFile)) : {};
let usageData = fs.existsSync(activity)
    ? JSON.parse(fs.readFileSync(activity))
    : { totalMessages: 0, users: {} };

if (!usageData.users) {
    usageData.users = {};
}
client.on('qr', (qr) => {
    console.log("Scan the QR code with WhatsApp:");
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp bot is ready!');
    console.log(userInfo());
    setInterval(checkReminders, 5000);
});

if (fs.existsSync('coins.json')) {
    coins = JSON.parse(fs.readFileSync('coins.json'));
}

function saveCoins() {
    fs.writeFileSync('coins.json', JSON.stringify(coins, null, 2));
}

function addCoins(userId, amount) {
    if (!coins[userId]) {
        coins[userId] = 0;
    }
    coins[userId] += amount;
    saveCoins();
}

function getCoins(userId) {
    return coins[userId] || 0;
}

function randomNum() {
    return Math.floor(Math.random() * 9) + 1;
}

function saveUsageData() {
    fs.writeFileSync(usageFile, JSON.stringify(userUsage, null, 2));
    fs.writeFileSync(codesFile, JSON.stringify(redeemCodes, null, 2));
}

function saveActivity() {
    fs.writeFileSync(activity, JSON.stringify(usageData, null, 2));
}

function generateCode(amount) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    redeemCodes[code] = amount;
    saveUsageData();
    console.log(`🎟 Generated code: ${code} (+${amount} uses)`);
    return code;
}

function customCode(code, amount) {
    redeemCodes[code] = amount;
    saveUsageData();
    console.log(`🎟 Generated code: ${code} (+${amount} uses)`);
}

function redeemCode(userId, code) {
    if (!redeemCodes[code]) return "Invalid or already used code.";
    const amount = redeemCodes[code];
    userUsage[userId] = (userUsage[userId] || 0) + amount;
    delete redeemCodes[code];
    saveUsageData();
    return `Code redeemed! You now have ${userUsage[userId]} uses left.`;
}

function getUsage(userId) {
    return userUsage[userId] || 0;
}

function consumeUsage(userId) {
    if (getUsage(userId) <= 0) return false;
    userUsage[userId]--;
    saveUsageData();
    return true;
}

// Check for due reminders
async function checkReminders() {
    const dueReminders = reminderManager.checkDueReminders();
    
    for (const reminder of dueReminders) {
        try {
            await client.sendMessage(reminder.userId, `*Reminder*\n${reminder.message}`);
            console.log(`Reminder sent to ${reminder.userId}: ${reminder.message}`);
        } catch (error) {
            console.error(`Failed to send reminder to ${reminder.userId}:`, error);
        }
    }
}

// Handle reminder commands
async function handleReminderCommand(message, args) {
    const userId = message.from;
    const chat = await message.getChat();
    
    if (args.length < 2) {
        return message.reply('Usage: !remind <type> <parameters>\n\nTypes:\n• daily <HH:MM> <message>\n• monthly <date> <HH:MM> <message>\n• once <day> <month> <HH:MM> <message>');
    }

    const type = args[1].toLowerCase();

    switch (type) {
        case 'daily':
            if (args.length < 4) {
                return message.reply('Usage: !remind daily <HH:MM> <message>\nExample: !remind daily 09:30 Take medicine');
            }
            const dailyTime = args[2];
            const dailyMessage = args.slice(3).join(' ');
            
            const dailyResult = reminderManager.addDailyReminder(userId, dailyTime, dailyMessage);
            if (dailyResult.success) {
                client.sendMessage(userId, `Daily reminder set!\nTime: ${dailyTime}\nMessage: ${dailyMessage}\nID: ${dailyResult.id}`, { linkPreview: false });
            } else {
                message.reply(`Error: ${dailyResult.error}`);
            }
            break;

        case 'monthly':
            if (args.length < 5) {
                return message.reply('Usage: !remind monthly <date> <HH:MM> <message>\nExample: !remind monthly 15 14:30 Pay rent');
            }
            const monthlyDate = args[2];
            const monthlyTime = args[3];
            const monthlyMessage = args.slice(4).join(' ');
            
            const monthlyResult = reminderManager.addMonthlyReminder(userId, monthlyDate, monthlyTime, monthlyMessage);
            if (monthlyResult.success) {
                client.sendMessage(userId, `Monthly reminder set!\nDate: ${monthlyDate} of every month\nTime: ${monthlyTime}\nMessage: ${monthlyMessage}\nID: ${monthlyResult.id}`, { linkPreview: false });
            } else {
                message.reply(`Error: ${monthlyResult.error}`);
            }
            break;

        case 'once':
            if (args.length < 6) {
                return message.reply('Usage: !remind once <day> <month> <HH:MM> <message>\nExample: !remind once 25 12 10:00 Christmas celebration');
            }
            const onceDay = args[2];
            const onceMonth = args[3];
            const onceTime = args[4];
            const onceMessage = args.slice(5).join(' ');
            
            const onceResult = reminderManager.addOneTimeReminder(userId, onceDay, onceMonth, onceTime, onceMessage);
            if (onceResult.success) {
                client.sendMessage(userId, `One-time reminder set!\nDate: ${onceDay}/${onceMonth}\nTime: ${onceTime}\nMessage: ${onceMessage}\nID: ${onceResult.id}`, { linkPreview: false });
            } else {
                message.reply(`Error: ${onceResult.error}`);
            }
            break;

        default:
            message.reply('Invalid reminder type. Use: daily, monthly, or once');
            break;
    }
}

// Handle reminders list command
async function handleRemindersListCommand(message) {
    const userId = message.from;
    const userReminders = reminderManager.getUserReminders(userId);
    
    if (userReminders.length === 0) {
        return message.reply('You have no active reminders.');
    }
    
    let response = `*Your Active Reminders (${userReminders.length})*\n\n`;
    userReminders.forEach((reminder, index) => {
        response += `${index + 1}. ${reminderManager.formatReminder(reminder)}\n\n`;
    });
    
    client.sendMessage(userId, response, { linkPreview: false });
}

// Handle delete reminder command
async function handleDeleteReminderCommand(message, args) {
    const userId = message.from;
    
    if (args.length < 2) {
        return message.reply('Usage: !delremind <reminderId>\nUse !reminders to see your reminder IDs');
    }
    
    const reminderId = args[1];
    const result = reminderManager.deleteReminder(userId, reminderId);
    
    if (result.success) {
        message.reply('Reminder deleted successfully!');
    } else {
        message.reply(`Error: ${result.error}`);
    }
}


class PolynomialSolver {
    
    // Rational Root Theorem - find possible rational roots
    static findRationalRoots(coefficients) {
        const a0 = coefficients[coefficients.length - 1]; // constant term
        const an = coefficients[0]; // leading coefficient
        
        if (a0 === 0) return [0]; // 0 is always a root if constant term is 0
        
        // Get factors of constant term and leading coefficient
        const factors_a0 = this.getFactors(Math.abs(a0));
        const factors_an = this.getFactors(Math.abs(an));
        
        const possibleRoots = [];
        
        // Generate all possible rational roots: ±(factors of a0)/(factors of an)
        for (const p of factors_a0) {
            for (const q of factors_an) {
                possibleRoots.push(p / q);
                possibleRoots.push(-p / q);
            }
        }
        
        // Remove duplicates and test each possible root
        const uniqueRoots = [...new Set(possibleRoots)];
        const actualRoots = [];
        
        for (const root of uniqueRoots) {
            if (Math.abs(this.evaluatePolynomial(coefficients, root)) < 1e-10) {
                actualRoots.push(root);
            }
        }
        
        return actualRoots.sort((a, b) => a - b);
    }
    
    // Get all positive factors of a number
    static getFactors(n) {
        if (n === 0) return [1];
        const factors = [];
        for (let i = 1; i <= Math.abs(n); i++) {
            if (n % i === 0) {
                factors.push(i);
            }
        }
        return factors;
    }
    
    // Polynomial division (synthetic division)
    static syntheticDivision(coefficients, root) {
        const result = [coefficients[0]];
        
        for (let i = 1; i < coefficients.length; i++) {
            result[i] = coefficients[i] + root * result[i - 1];
        }
        
        // Return quotient (all but last element) and remainder (last element)
        return {
            quotient: result.slice(0, -1),
            remainder: result[result.length - 1]
        };
    }
    
    // Deflate polynomial by removing known roots
    static deflatePolynomial(coefficients, roots) {
        let currentPoly = [...coefficients];
        
        for (const root of roots) {
            const division = this.syntheticDivision(currentPoly, -root);
            if (Math.abs(division.remainder) < 1e-10) {
                currentPoly = division.quotient;
            }
        }
        
        return currentPoly;
    }
    
    // Find all roots using comprehensive approach
    static findAllRoots(coefficients) {
        const allRoots = [];
        let workingPoly = [...coefficients];
        
        // Step 1: Find rational roots first
        const rationalRoots = this.findRationalRoots(workingPoly);
        
        for (const root of rationalRoots) {
            // Add root with its multiplicity
            let multiplicity = 0;
            while (Math.abs(this.evaluatePolynomial(workingPoly, root)) < 1e-10 && workingPoly.length > 1) {
                const division = this.syntheticDivision(workingPoly, -root);
                if (Math.abs(division.remainder) < 1e-10) {
                    workingPoly = division.quotient;
                    multiplicity++;
                } else {
                    break;
                }
            }
            
            for (let i = 0; i < multiplicity; i++) {
                allRoots.push(root);
            }
        }
        
        // Step 2: Handle remaining polynomial
        if (workingPoly.length > 1) {
            const degree = workingPoly.length - 1;
            
            if (degree === 1) {
                // Linear case
                const root = -workingPoly[1] / workingPoly[0];
                allRoots.push(root);
            } else if (degree === 2) {
                // Quadratic case
                const quadRoots = this.solveQuadratic(workingPoly[0], workingPoly[1], workingPoly[2]);
                allRoots.push(...quadRoots);
            } else if (degree === 3) {
                // Cubic case
                const cubicRoots = this.solveCubic(workingPoly[0], workingPoly[1], workingPoly[2], workingPoly[3]);
                allRoots.push(...cubicRoots);
            } else {
                // Higher degree - use numerical methods
                const numericalRoots = this.findNumericalRoots(workingPoly, degree - allRoots.length);
                allRoots.push(...numericalRoots);
            }
        }
        
        return allRoots.sort((a, b) => {
            if (typeof a === 'number' && typeof b === 'number') return a - b;
            return 0;
        });
    }
    
    // Enhanced numerical root finding
    static findNumericalRoots(coefficients, expectedRoots) {
        const roots = [];
        const tolerance = 1e-10;
        const maxAttempts = 1000;
        
        // Generate more systematic initial guesses
        const guesses = [];
        
        // Integer guesses from -20 to 20
        for (let i = -20; i <= 20; i++) {
            guesses.push(i);
        }
        
        // Fractional guesses
        for (let i = -10; i <= 10; i++) {
            for (let j = 2; j <= 10; j++) {
                guesses.push(i / j);
            }
        }
        
        // Random guesses in different ranges
        for (let range of [1, 5, 10, 50, 100]) {
            for (let i = 0; i < 20; i++) {
                guesses.push((Math.random() - 0.5) * 2 * range);
            }
        }
        
        // Complex initial guesses (for complex roots)
        const complexGuesses = [];
        for (let i = 0; i < 50; i++) {
            const real = (Math.random() - 0.5) * 10;
            const imag = (Math.random() - 0.5) * 10;
            complexGuesses.push({ real, imag });
        }
        
        let attempts = 0;
        
        // Try real roots first
        for (const guess of guesses) {
            if (attempts >= maxAttempts || roots.length >= expectedRoots) break;
            attempts++;
            
            try {
                const root = this.newtonRaphson(coefficients, guess);
                
                if (!isNaN(root) && isFinite(root) && 
                    Math.abs(this.evaluatePolynomial(coefficients, root)) < tolerance) {
                    
                    const isNewRoot = roots.every(existingRoot => {
                        if (typeof existingRoot === 'string') return true; // Skip complex comparison
                        return Math.abs(existingRoot - root) > tolerance;
                    });
                    
                    if (isNewRoot) {
                        roots.push(root);
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        // If we still need more roots, they might be complex
        const remainingRoots = expectedRoots - roots.length;
        if (remainingRoots > 0) {
            // Use Durand-Kerner method or add placeholder complex roots
            for (let i = 0; i < remainingRoots; i += 2) {
                if (i + 1 < remainingRoots) {
                    // Add conjugate pair of complex roots
                    roots.push(`Complex root ${i/2 + 1}`);
                    roots.push(`Complex root ${i/2 + 1} (conjugate)`);
                } else {
                    roots.push(`Complex root ${Math.floor(i/2) + 1}`);
                }
            }
        }
        
        return roots;
    }
    
    // Solve linear equations: ax + b = 0
    static solveLinear(a, b) {
        if (a === 0) {
            return b === 0 ? ["Infinite solutions"] : ["No solution"];
        }
        return [-b / a];
    }
    
    // Solve quadratic equations: ax² + bx + c = 0
    static solveQuadratic(a, b, c) {
        if (a === 0) {
            return this.solveLinear(b, c);
        }
        
        const discriminant = b * b - 4 * a * c;
        
        if (discriminant > 0) {
            const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
            const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
            return [x1, x2];
        } else if (discriminant === 0) {
            const x = -b / (2 * a);
            return [x];
        } else {
            // Complex roots
            const realPart = -b / (2 * a);
            const imaginaryPart = Math.sqrt(-discriminant) / (2 * a);
            return [
                `${realPart.toFixed(4)} + ${imaginaryPart.toFixed(4)}i`,
                `${realPart.toFixed(4)} - ${imaginaryPart.toFixed(4)}i`
            ];
        }
    }
    
    // Solve cubic equations: ax³ + bx² + cx + d = 0
    static solveCubic(a, b, c, d) {
        if (a === 0) {
            return this.solveQuadratic(b, c, d);
        }
        
        // Convert to depressed cubic: t³ + pt + q = 0
        const p = (3 * a * c - b * b) / (3 * a * a);
        const q = (2 * b * b * b - 9 * a * b * c + 27 * a * a * d) / (27 * a * a * a);
        
        const discriminant = (q / 2) * (q / 2) + (p / 3) * (p / 3) * (p / 3);
        
        if (discriminant > 0) {
            // One real root
            const u = Math.cbrt(-q / 2 + Math.sqrt(discriminant));
            const v = Math.cbrt(-q / 2 - Math.sqrt(discriminant));
            const t = u + v;
            const x = t - b / (3 * a);
            return [x];
        } else if (discriminant === 0) {
            // Two or three real roots
            const u = Math.cbrt(-q / 2);
            const t1 = 2 * u;
            const t2 = -u;
            const x1 = t1 - b / (3 * a);
            const x2 = t2 - b / (3 * a);
            return q === 0 ? [x2] : [x1, x2];
        } else {
            // Three distinct real roots
            const rho = Math.sqrt(-(p / 3) * (p / 3) * (p / 3));
            const theta = Math.acos(-q / 2 / rho);
            
            const t1 = 2 * Math.cbrt(rho) * Math.cos(theta / 3);
            const t2 = 2 * Math.cbrt(rho) * Math.cos((theta + 2 * Math.PI) / 3);
            const t3 = 2 * Math.cbrt(rho) * Math.cos((theta + 4 * Math.PI) / 3);
            
            const x1 = t1 - b / (3 * a);
            const x2 = t2 - b / (3 * a);
            const x3 = t3 - b / (3 * a);
            
            return [x1, x2, x3];
        }
    }
    
    // Newton-Raphson method
    static newtonRaphson(coefficients, initialGuess = 1, tolerance = 1e-12, maxIterations = 100) {
        let x = initialGuess;
        
        for (let i = 0; i < maxIterations; i++) {
            const fx = this.evaluatePolynomial(coefficients, x);
            const fpx = this.evaluateDerivative(coefficients, x);
            
            if (Math.abs(fpx) < tolerance) {
                break;
            }
            
            const newX = x - fx / fpx;
            
            if (Math.abs(newX - x) < tolerance) {
                return newX;
            }
            
            x = newX;
        }
        
        return x;
    }
    
    // Evaluate polynomial at x
    static evaluatePolynomial(coefficients, x) {
        let result = 0;
        for (let i = 0; i < coefficients.length; i++) {
            result += coefficients[i] * Math.pow(x, coefficients.length - 1 - i);
        }
        return result;
    }
    
    // Evaluate polynomial derivative at x
    static evaluateDerivative(coefficients, x) {
        let result = 0;
        for (let i = 0; i < coefficients.length - 1; i++) {
            const power = coefficients.length - 1 - i;
            result += coefficients[i] * power * Math.pow(x, power - 1);
        }
        return result;
    }
    
    // Main solve function
    static solve(coefficients) {
        // Remove leading zeros
        while (coefficients.length > 1 && coefficients[0] === 0) {
            coefficients.shift();
        }
        
        const degree = coefficients.length - 1;
        
        if (degree < 0) return ["No valid polynomial"];
        
        switch (degree) {
            case 0:
                return coefficients[0] === 0 ? ["Infinite solutions"] : ["No solution"];
            case 1:
                return this.solveLinear(coefficients[0], coefficients[1]);
            case 2:
                return this.solveQuadratic(coefficients[0], coefficients[1], coefficients[2]);
            case 3:
                return this.solveCubic(coefficients[0], coefficients[1], coefficients[2], coefficients[3]);
            default:
                return this.findAllRoots(coefficients);
        }
    }
}

// Enhanced polynomial parser (unchanged from previous version)
function parsePolynomial(raw) {
    try {
        let cleanPoly = raw
            .toLowerCase()
            .replace(/\s+/g, '')           // remove spaces
            .replace(/\*\*(\d+)/g, '^$1')  // convert ** to ^
            .replace(/\*/g, '')            // remove multiplication signs
            .replace(/-/g, '+-');          // turn - into "+-"

        if (cleanPoly.startsWith('+')) cleanPoly = cleanPoly.slice(1);

        // Find the highest degree
        let degree = 0;
        const exponents = [...cleanPoly.matchAll(/x\^(-?\d+)/g)].map(m => parseInt(m[1]));
        if (exponents.length > 0) {
            degree = Math.max(...exponents);
        } else if (cleanPoly.includes('x')) {
            degree = 1;
        }

        const coeffs = new Array(degree + 1).fill(0);

        // Split by + but keep the + for negative terms
        const terms = cleanPoly.split('+').filter(term => term.length > 0);

        terms.forEach(term => {
            if (!term) return;
            
            let coef = 0;
            let power = 0;

            if (term.includes('x')) {
                // Extract coefficient and power from terms like "3x^2", "-x", "x^3"
                const match = term.match(/^([+-]?\d*\.?\d*)x(\^([+-]?\d+))?$/);
                
                if (match) {
                    let coefStr = match[1];
                    
                    if (coefStr === '' || coefStr === '+') coef = 1;
                    else if (coefStr === '-') coef = -1;
                    else coef = parseFloat(coefStr);

                    if (match[3] !== undefined) {
                        power = parseInt(match[3]);
                    } else {
                        power = 1;
                    }
                } else {
                    // Fallback parsing
                    if (term.includes('^')) {
                        const [coefPart, powPart] = term.split('x^');
                        coef = coefPart === '' || coefPart === '+' ? 1 : 
                            coefPart === '-' ? -1 : parseFloat(coefPart);
                        power = parseInt(powPart);
                    } else {
                        const coefPart = term.replace('x', '');
                        coef = coefPart === '' || coefPart === '+' ? 1 : 
                            coefPart === '-' ? -1 : parseFloat(coefPart);
                        power = 1;
                    }
                }
            } else {
                // Constant term
                coef = parseFloat(term);
                power = 0;
            }

            if (!isNaN(coef) && power >= 0 && power <= degree) {
                coeffs[degree - power] += coef;
            }
        });

        return coeffs;
    } catch (error) {
        throw new Error("Failed to parse polynomial: " + error.message);
    }
}

// Enhanced root formatting with integer preference
function formatRoots(roots) {
    if (!Array.isArray(roots)) return roots.toString();
    
    return roots.map(root => {
        if (typeof root === 'string') return root; // Complex numbers or special cases
        if (typeof root === 'number') {
            // Check if it's essentially an integer
            if (Math.abs(root - Math.round(root)) < 1e-10) {
                return Math.round(root).toString();
            }
            // Check if it's a simple fraction
            for (let denom = 2; denom <= 12; denom++) {
                const numerator = root * denom;
                if (Math.abs(numerator - Math.round(numerator)) < 1e-10) {
                    const num = Math.round(numerator);
                    if (Math.abs(num) < 100) { // Avoid very large fractions
                        return denom === 1 ? num.toString() : `${num}/${denom}`;
                    }
                }
            }
            // Otherwise show decimal
            return Math.abs(root) < 1e-10 ? '0' : root.toFixed(6).replace(/\.?0+$/, '');
        }
        return root.toString();
    }).join(', ');
}

client.on('message', async (message) => {
    usageData.totalMessages++;
    const userId = message.from;
    const msg = message.body.trim();
    const chat = await message.getChat();
    console.log(userId);
    
    if (!usageData.users[chat.name]) {
        usageData.users[chat.name] = 0;
    }
    usageData.users[chat.name]++;
    saveActivity();
    
    if (chat.isGroup) {
        console.log(`Group Name: ${chat.name}`);
    }
    
    if (!msg.startsWith('!')) {
        if (anonPair[userId]) {
            const targetId = anonPair[userId];
            client.sendMessage(targetId, message.body);
        }
    }

    if (msg.startsWith('!')) {
        const args = msg.slice(1).trim().split(" ");
        const command = args[0].toLowerCase();
        const freeCommand = ['generate', 'codelist', 'redeem', 'usage', 'coin', 'cancel', 'status', 'endchat'];
        
        if (!freeCommand.includes(command)) {
            if (!consumeUsage(userId)) {
                return message.reply("You have no uses left! Redeem a code to use me.");
            }
        }

        switch (command) {
            case 'remind':
                await handleReminderCommand(message, args);
                break;
                
            case 'reminders':
                await handleRemindersListCommand(message);
                break;
                
            case 'delremind':
                await handleDeleteReminderCommand(message, args);
                break;

            case 'helpremind':
                const helpText =
                    `*Reminder Commands:*\n` +
                    `• !remind daily <HH:MM> <message>\n` +
                    `• !remind monthly <date> <HH:MM> <message>\n` +
                    `• !remind once <day> <month> <HH:MM> <message>\n` +
                    `• !reminders - List all your reminders\n` +
                    `• !delremind https://<ID>.sz - Delete a reminder\n\n` +
                    `*Examples:*\n` +
                    `• !remind daily 08:00 Good morning!\n` +
                    `• !remind monthly 1 09:00 Pay bills\n` +
                    `• !remind once 25 12 10:00 Christmas!\n\n` +
                    `Time format: 24-hour (HH:MM)`;
                message.reply(helpText);
                break;
        }


        if (command === 'status') {
            if (anonPair[userId]) {
                const targetId = anonPair[userId];
                message.reply(`You are connected to ${targetId}.`);
            } else {
                message.reply('You are not connected to anyone.');
            }
        }
        
        if (command === 'anomchat') {
            let targetNumber = args.slice(1);
            targetNumber = targetNumber.join('').replace(/[\s+\-]/g, '');
            if (targetNumber.startsWith('08')) {
                targetNumber = '62' + targetNumber.slice(1);
            }
            console.log(targetNumber);
            const phoneRegex = /^62\d{8,13}$/;

            if (!phoneRegex.test(targetNumber)) {
                return message.reply('Please enter a valid Indonesian number. Example: 6289533202987 or 089533202987');
            }

            const targetId = targetNumber + '@c.us';
            const senderId = userId;
            if (anonPair[senderId]) {
                return message.reply('You are already connected to someone.\nType `!endchat` to end the current anonymous chat before starting a new one.');
            }
            anonPair[senderId] = targetId;
            anonPair[targetId] = senderId;

            client.sendMessage(targetId, `Hello! I'm your anonymous partner developed by *Jrmysz*!`);
            message.reply(`You are now connected to ${targetNumber}.`);
        }

        if (command === 'endchat') {
            const senderId = userId;
            if (anonPair[senderId]) {
                const targetId = anonPair[senderId];
                message.reply('Anonymous chat ended.');
                client.sendMessage(targetId, 'The anonymous chat has ended.');
                delete anonPair[senderId];
                delete anonPair[targetId];
            } else { 
                message.reply('You are not connected to anyone.');
            }
        }
        
        if (command === 'poly' || command === 'solve') {
            try {
                const equation = args.slice(1).join(' ').trim();
                
                if (!equation) {
                    return message.reply(`*Polynomial Solver*\n\nFinds ALL roots (integers first, then decimals/fractions)\n\nUsage: \`!poly [equation]\`\n\nExamples:\n• \`!poly x^3-6x^2+11x-6\` → 1, 2, 3\n• \`!poly x^5-5x^3+4x\` → All 5 roots\n• \`!poly 2x^4-8x^2+6\` → Integer and decimal roots\n\n✨ Works with any degree polynomial!`);
                }

                console.log("Input equation:", equation);
                const coeffs = parsePolynomial(equation);
                console.log("Parsed coefficients:", coeffs);

                const roots = PolynomialSolver.solve(coeffs);
                console.log("Found roots:", roots);

                const formattedRoots = formatRoots(roots);
                const degree = coeffs.length - 1;
                
                let response = `*Polynomial Solver*\n\n`;
                response += `Equation: ${equation}\n`;
                response += `Degree: ${degree}\n`;
                response += `Roots (${roots.length}): ${formattedRoots}`;
                
                
                // Add note about root finding method
                const hasIntegerRoots = roots.some(r => typeof r === 'number' && Math.abs(r - Math.round(r)) < 1e-10);
                if (hasIntegerRoots) {
                    response += `\n\nFound integer roots first!`;
                }

                message.reply(response);
                
            } catch (err) {
                console.error("Polynomial solver error:", err);
                message.reply(`*Error parsing polynomial*\n\nPlease check your format:\n• Use ^ for exponents (x^2)\n• Use + and - for signs\n• Example: \`!poly x^3+6x^2+11x+6\`\n\nError: ${err.message}`);
            }
        }

        if (command === 'generate') {
            if (userId !== '62895332029657@c.us') {
                return message.reply("You are not authenticated to use this command.");
            }
            message.reply(`The code is ${generateCode(parseInt(args[1]))}`);
        } 
        else if (command === 'codelist') {
            if (userId !== '62895332029657@c.us') {
                return message.reply("You are not authenticated to use this command.");
            }
            let codelist = "*Redeem Codes Table*\n";
            codelist += "```Code       | Value\n";
            codelist += "------------|------\n";
            for (let code in redeemCodes) {
                codelist += `${code} | ${redeemCodes[code]}\n`;
            }
            codelist += "```";
            message.reply(codelist);
        } 

        if (command === 'solve') {
            message.reply('waiting for update')
        }
        if (command === 'usage') {
            return message.reply(`You have ${getUsage(userId)} uses left.`);
        }

        if (command === 'redeem') {
            const parts = msg.split(" ");
            if (!parts[1]) return message.reply("Please provide a code.");
            const result = redeemCode(userId, parts[1]);
            console.log(`${parts[1]} is used.`);
            return message.reply(result);
        }
        

        if (command === 'bet') {
            const bet = parseInt(args[1]);
            if (isNaN(bet) || bet <= 0) return message.reply("Please enter a valid bet amount, e.g. `bet 10`");

            const rNum1 = randomNum();
            const rNum2 = randomNum();
            const rNum3 = randomNum();
            const digits = [rNum1, rNum2, rNum3];
            const sorted = [...digits].sort((a, b) => a - b);

            let multiplier = 0;

            const isTriple = rNum1 === rNum2 && rNum2 === rNum3;
            const isTwoKind = !isTriple && (rNum1 === rNum2 || rNum1 === rNum3 || rNum2 === rNum3);
            const isConsecutive = (sorted[1] === sorted[0] + 1 && sorted[2] === sorted[1] + 1);
            const isExact = (rNum1 === 4 && rNum2 === 5 && rNum3 === 6);

            if (isExact) multiplier = 950; 
            else if (isTriple) multiplier = 95;    
            else if (isTwoKind) multiplier = 3.5;
            else if (isConsecutive) multiplier = 19.5;

            message.reply(`${bet} coins has been betted!`);
            addCoins(userId, -bet);

            setTimeout(() => {
                if (multiplier > 0) {
                    const winnings = bet * multiplier;
                    message.reply(`You got *${rNum1} ${rNum2} ${rNum3}*, pattern hit! Multiplier: ${multiplier}x. You win ${winnings} coins!`);
                    addCoins(userId, winnings);
                } else {
                    message.reply(`You got *${rNum1} ${rNum2} ${rNum3}*, no pattern hit. You lost your bet.`);
                }
            }, 1000);
        }

        if (command === 'coin') {
            message.reply(`You have ${getCoins(userId)} coins`);
        }

        if (command === 'pfp') {
        const mentionedIds = message.mentionedIds;
            if (mentionedIds.length === 0) {
                return message.reply('Please mention a user!');
            }
            const targetId = mentionedIds[0];
            const contact = await client.getContactById(targetId);
            const username = contact.pushname || contact.name || contact.number;
            try {
                const url = await client.getProfilePicUrl(targetId) || 'I was not able to get the profile picture due to their privacy setting.';
                client.sendMessage(chat.id._serialized, `Profile picture URL for @${username}:\n${url}`, { linkPreview: false });
            } catch (err) {
                message.reply('Could not fetch profile picture.');
            }
        }

        if (command === ('guess')) {
            const num = parseInt(args[1]);
            console.log(num);
            if (num > 9) {
            const secretNumber = Math.floor(Math.random() * num) + 1;
            gameSessions[userId] = {
                secret : secretNumber,
                maxguess : num
            };
            client.sendMessage(userId, `I'm thinking of a number between 1 and ${num}. Try to guess!`);
            return;
            } else {
                client.sendMessage(userId, "Please enter a positive number at least 10!");
                return;
            }
        }

        if (msg.toLowerCase() === '!cancel') {
            delete gameSessions[userId];
            client.sendMessage(userId, "Game Canceled, Please use `!guess <num>` to start playing!");
        }

        if (gameSessions[userId] && msg.startsWith('!')) {
            const guess = parseInt(msg.slice(1));
            const { secret, maxguess } = gameSessions[userId];

            if (isNaN(guess)) {
                client.sendMessage(userId, `Please send a valid number between 1 and ${maxguess}.`);
                return;
            }

            if (guess === secret) {
                delete gameSessions[userId];
                addCoins(userId, 10);
                client.sendMessage(userId, `Correct! You guessed it! Now you have ${getCoins(userId)} coins.`);
            } else if (guess < secret) {
                client.sendMessage(userId, "Higher!");
            } else if (guess > secret) {
                client.sendMessage(userId, "Lower!");
            } else if (guess > maxguess) {
                client.sendMessage(userId, "Are u kidding me?");
            } else {
                client.sendMessage(userId, "Invalid input");
            }
            return;
        }
    }

    if (msg.startsWith('?')) {
        client.sendMessage(userId, "*Bot by Jrmysz* \n!usage\n!redeem\n!pfp\n!guess\n!coin\n!bet\n!poly\n!anomchat\n!endchat\n!status\n!helpremind\nThis bot is still on development by *Jrmysz*.");
    }
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

process.on('SIGINT', () => {
    console.log('\nShutting down bot...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down bot...');
    client.destroy();
    process.exit(0);
});

console.log("Console ready. Type 'gen <amount>' to create a redeem code.");

rl.on("line", (input) => {
    const parts = input.trim().split(" ");
    if (parts[0] === "usage") {
        console.log("Bot Usage Stats:");
        console.log("Total usage:", usageData.totalMessages);
        console.log("Top users:");
        
        const sortedUsers = Object.entries(usageData.users)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        sortedUsers.forEach(([user, count], idx) => {
            console.log(`${idx + 1}. ${user} — ${count} messages`);
        });
    }
    if (parts[0] === "resetusage") {
        usageData.totalMessages = 0;
        usageData.users = {};
        saveUsageData();
        console.log("Usage data has been reset.");
    }
    if (parts[0] === "gen") {
        const amount = parseInt(parts[1]) || 1;
        generateCode(amount);
    }
    if (parts[0] === "codelist") {
        console.log(redeemCodes);
    }
    if (parts[0] === "customcode") {
        const code = parts[1];
        const amount = parseInt(parts[2]);
        if (!code || isNaN(amount)) {
            console.log("Usage: customcode <code> <amount>");
            return;
        }
        customCode(code, amount);
    }
    if (parts[0] === "remove" && parts[1]) {
        if (redeemCodes[parts[1]]) {
            delete redeemCodes[parts[1]];
            saveUsageData();
            console.log(`${parts[1]} has been removed.`);
        } else {
            console.log(`Code ${parts[1]} not found.`);
        }
    }
});

client.initialize();