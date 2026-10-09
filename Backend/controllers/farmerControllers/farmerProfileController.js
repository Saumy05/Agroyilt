const User = require('../../models/User');

const farmerProfileController = {
  // Get Profile
  getProfile: async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      res.status(200).json({ success: true, data: user });
    } catch (error) {
      console.error('Error fetching farmer profile:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Update Profile
  updateProfile: async (req, res) => {
    try {
      const { name, email, addresses, gender } = req.body;
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if (name) user.name = name;
      if (email) user.email = email;
      if (gender !== undefined) {
        if (['male', 'female', 'other'].includes(String(gender).toLowerCase())) {
          user.gender = String(gender).toLowerCase();
        } else if (gender === null || gender === '') {
          user.gender = null;
        }
      }
      
      // Update Address (Enforced only 1 address as per User model comments)
      if (addresses && Array.isArray(addresses) && addresses.length > 0) {
        user.addresses = [addresses[0]]; 
      }

      await user.save();
      res.status(200).json({ success: true, message: 'Profile updated successfully', data: user });
    } catch (error) {
      console.error('Error updating farmer profile:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Add Farm
  addFarm: async (req, res) => {
    try {
      const { name, sizeInAcres, cropType, khasraNumber, location } = req.body;
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const newFarm = {
        name: name || 'My Farm',
        sizeInAcres: sizeInAcres || 0,
        cropType: cropType || [],
        khasraNumber: khasraNumber || null,
        location: location || { lat: 0, lng: 0 }
      };

      user.farms.push(newFarm);
      await user.save();

      res.status(201).json({ success: true, message: 'Farm added successfully', data: user.farms });
    } catch (error) {
      console.error('Error adding farm:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Get Farms
  getFarms: async (req, res) => {
    try {
      const user = await User.findById(req.user.id).select('farms');
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      res.status(200).json({ success: true, data: user.farms });
    } catch (error) {
      console.error('Error fetching farms:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Update Farm
  updateFarm: async (req, res) => {
    try {
      const farmId = req.params.id;
      const { name, sizeInAcres, cropType, khasraNumber, location } = req.body;
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const farm = user.farms.id(farmId);
      if (!farm) {
        return res.status(404).json({ success: false, message: 'Farm not found' });
      }

      if (name) farm.name = name;
      if (sizeInAcres !== undefined) farm.sizeInAcres = sizeInAcres;
      if (cropType) farm.cropType = cropType;
      if (khasraNumber !== undefined) farm.khasraNumber = khasraNumber;
      if (location) farm.location = location;

      await user.save();
      res.status(200).json({ success: true, message: 'Farm updated successfully', data: farm });
    } catch (error) {
      console.error('Error updating farm:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  },

  // Delete Farm
  deleteFarm: async (req, res) => {
    try {
      const farmId = req.params.id;
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const farm = user.farms.id(farmId);
      if (!farm) {
        return res.status(404).json({ success: false, message: 'Farm not found' });
      }

      user.farms.pull(farmId);
      await user.save();

      res.status(200).json({ success: true, message: 'Farm deleted successfully' });
    } catch (error) {
      console.error('Error deleting farm:', error);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  }
};

module.exports = farmerProfileController;
