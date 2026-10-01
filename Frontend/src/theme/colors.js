/**
 * Centralized Theme Colors Configuration
 * Separate themes for User and Vendor modules
 * Update colors here to change theme across entire app
 * 
 * Usage:
 * - User module: import { userTheme } from '../../../../theme'
 * - Vendor module: import { vendorTheme } from '../../../../theme'
 * - Worker module: import { workerTheme } from '../../../../theme'
 */

const brand = {
  // Primary farm green
  teal: '#2E7D32',
  // Light supporting green
  yellow: '#81C784',
  // Soft accent green
  orange: '#A5D6A7',
  gradient: 'linear-gradient(135deg, #2E7D32 0%, #81C784 50%, #A5D6A7 100%)',
  conic: 'conic-gradient(from 0deg, #2E7D32, #81C784, #A5D6A7, #2E7D32)'
};

const userTheme = {
  // Very light green farm background
  backgroundGradient: 'linear-gradient(180deg, #F1F8E9 0%, #FFFFFF 40%)',
  gradient: brand.gradient,
  // Soft green header
  headerGradient: 'linear-gradient(135deg, #F1F8E9 0%, #A5D6A7 100%)',
  headerBg: '#F1F8E9',
  // Primary buttons/icons
  button: brand.teal,
  icon: brand.teal,
  // Subtle green card styling
  cardShadow: '0 8px 16px -2px rgba(46, 125, 50, 0.14), 0 4px 10px -1px rgba(46, 125, 50, 0.08)',
  cardBorder: '1px solid rgba(165, 214, 167, 0.6)',
  brand: brand
};

// Vendor Theme Colors
const vendorTheme = {
  backgroundGradient: 'linear-gradient(180deg, #F1F8E9 0%, #FFFFFF 40%)',
  gradient: brand.gradient,
  headerGradient: 'linear-gradient(135deg, #F1F8E9 0%, #A5D6A7 100%)',
  headerBg: '#F1F8E9',
  button: brand.teal,
  icon: brand.teal,
  brand: brand
};

// Worker Theme Colors
const workerTheme = {
  backgroundGradient: 'linear-gradient(to bottom, rgba(46, 125, 50, 0.03) 0%, rgba(165, 214, 167, 0.03) 12%, #ffffff 24%)',
  gradient: brand.gradient,
  headerGradient: brand.teal,
  button: brand.teal,
  icon: brand.teal,
  brand: brand
};

// Default theme (for backward compatibility)
const themeColors = userTheme;

// Export all themes
export { userTheme, vendorTheme, workerTheme, brand };
export default themeColors;


