const jwt = require('jsonwebtoken');
const User = require('../models/User');
const  Admin = require('../models/Admin'); 
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};
// if the admin is not static then use this below authorisation middleware
const adminAuth = async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ message: 'No token provided' });
      }
  
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
      // 🛠 Use the correct key here
      const admin = await Admin.findById(decoded.adminId);
  
      if (!admin || !admin.isActive) {
        return res.status(401).json({ message: 'Invalid admin token' });
      }
  
      req.admin = admin;
      next();
    } catch (error) {
      console.error("Token verification failed:", error);
      res.status(401).json({ message: 'Invalid token' });
    }
  };
  
//otherwise use this
// const adminAuth = async (req, res, next) => {
//     try {
//       const token = req.header('Authorization')?.replace('Bearer ', '');
//       if (!token) {
//         return res.status(401).json({ message: 'No token provided' });
//       }
  
//       const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
//       // Check if role is admin (since static admin has no DB record)
//       if (decoded.role !== 'admin') {
//         return res.status(403).json({ message: 'Access denied: Admins only' });
//       }
  
//       req.admin = { username: decoded.username, role: decoded.role }; // attach static admin info
//       next();
//     } catch (error) {
//       res.status(401).json({ message: 'Invalid token', error: error.message });
//     }
//   };

module.exports = { auth, adminAuth };