// routes/userRoutes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = (models) => {
    const router = express.Router();
    const { User } = models;

    router.post('/register', async (req, res) => {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ error: 'All fields are required.' });
        try {
            if (await User.findOne({ where: { email } })) return res.status(409).json({ error: 'Email already in use.' });
            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await User.create({ username, email, password: hashedPassword });
            res.status(201).json(newUser);
        } catch (error) {
            console.error('Registration Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    router.post('/login', async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
        try {
            const user = await User.scope('withPassword').findOne({ where: { email } });
            if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials.' });
            const payload = { id: user.id, email: user.email };
            const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
            res.json({ message: 'Login successful!', token });
        } catch (error) {
            console.error('Login Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });
    
    return router;
};