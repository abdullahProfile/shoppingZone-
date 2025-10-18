# Online Cloth Store Frontend

A modern, responsive React frontend for the online clothing store with real-time features, beautiful UI, and proper authentication flow.

## 🌟 Features

### Core Features
- **Responsive Design**: Beautiful UI that works on all devices
- **Authentication System**: Login/Signup with proper state management
- **Product Catalog**: Browse products with filtering, sorting, and search
- **Shopping Cart**: Real-time cart management with session persistence
- **Order Management**: Complete order lifecycle with status tracking
- **Real-time Updates**: WebSocket integration for live updates

### UI/UX Features
- **Material-UI Design**: Clean, modern interface using Material-UI
- **Animations**: Smooth transitions and micro-interactions
- **Loading States**: Proper loading indicators and skeleton screens
- **Error Handling**: User-friendly error messages and recovery
- **Accessibility**: ARIA compliant and keyboard navigation support

### Authentication Features
- **Protected Routes**: Secure access to cart and checkout pages
- **Session Management**: Persistent login state across page refreshes
- **Social Login**: Google and Facebook authentication (demo mode)
- **User Profile**: Account management and preferences

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Backend server running on port 5000

### Installation

1. **Navigate to frontend directory**
   ```bash
   cd cloth-store/frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

The app will open at `http://localhost:3000`

## 🎨 Design System

### Theme
- **Primary Color**: Linear gradient (#667eea to #764ba2)
- **Secondary Colors**: Material-UI default palette
- **Typography**: Roboto font family
- **Spacing**: 8px base unit
- **Border Radius**: Consistent rounded corners

### Components
- **Buttons**: Gradient primary buttons with hover effects
- **Cards**: Elevated cards with subtle shadows
- **Forms**: Clean input fields with proper validation
- **Navigation**: Sticky header with user context

## 📱 Pages Overview

### Public Pages
- **Home Page**: Featured products and brand introduction
- **Products Page**: Complete product catalog with filters
- **Product Detail**: Individual product information
- **Login/Signup**: Authentication pages with social login

### Protected Pages
- **Shopping Cart**: Cart management and checkout preparation
- **Checkout**: Order placement with payment processing
- **Orders**: Order history and tracking
- **Profile**: User account management

## 🔐 Authentication Flow

### Login Process
1. User enters credentials or uses social login
2. AuthContext manages authentication state
3. User is redirected to intended destination
4. Navbar updates to show user information

### Protected Routes
- Cart, Checkout, Orders require authentication
- Automatic redirect to login with return path
- Persistent session across page refreshes

### User Experience
- Smooth transitions between authenticated states
- Clear feedback for authentication actions
- Graceful handling of authentication errors

## 🛒 Shopping Experience

### Product Browsing
- **Search**: Real-time search across products
- **Filtering**: Category, price range, and availability filters
- **Sorting**: Multiple sorting options (name, price, rating)
- **View Modes**: Grid and list view options

### Cart Management
- **Add to Cart**: Requires authentication and size/color selection
- **Quantity Updates**: Real-time quantity adjustments
- **Persistence**: Cart state saved across sessions
- **Validation**: Stock availability and price updates

### Checkout Process
- **Order Summary**: Complete breakdown of costs
- **Shipping**: Free shipping calculator
- **Payment**: Simulated payment processing
- **Confirmation**: Order status and tracking information

## 🔄 Real-time Features

### WebSocket Integration
- **Cart Updates**: Live cart synchronization
- **Order Status**: Real-time order updates
- **Stock Updates**: Inventory change notifications
- **Connection Status**: Visual connection indicators

### State Management
- **Context API**: Authentication and cart state
- **Local Storage**: Persistent cart and user data
- **Session Management**: Secure session handling

## 🎯 Component Architecture

### Context Providers
- **AuthProvider**: User authentication state
- **CartProvider**: Shopping cart management
- **App**: Main application wrapper

### Common Components
- **ProtectedRoute**: Authentication-based routing
- **LoadingSpinner**: Consistent loading states
- **ErrorBoundary**: Error handling and recovery

### Layout Components
- **Navbar**: Navigation with user context
- **Footer**: Site footer with links
- **Container**: Responsive page layout

## 📊 Performance Features

### Optimization
- **Code Splitting**: Lazy loading of routes
- **Memoization**: Optimized re-renders
- **Image Optimization**: Responsive images with lazy loading
- **Bundle Optimization**: Tree shaking and minification

### User Experience
- **Skeleton Loading**: Content placeholders during loading
- **Progressive Loading**: Incremental content loading
- **Offline Support**: Basic offline functionality
- **Error Recovery**: Graceful error handling

## 🛠️ Development

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start development server |
| `npm run build` | Build for production |
| `npm test` | Run test suite |
| `npm run eject` | Eject from Create React App |

### Project Structure
```
frontend/
├── public/                 # Static assets
├── src/
│   ├── components/         # Reusable components
│   │   ├── common/         # Common components
│   │   └── layout/         # Layout components
│   ├── context/            # React contexts
│   ├── pages/              # Page components
│   ├── services/           # API services
│   ├── hooks/              # Custom hooks
│   ├── utils/              # Utility functions
│   └── theme/              # Theme configuration
├── package.json
└── README.md
```

### Code Style
- **ESLint**: JavaScript linting
- **Prettier**: Code formatting
- **Component Structure**: Functional components with hooks
- **State Management**: Context API and useState/useReducer

## 🔧 Configuration

### Environment Variables
```bash
# Development
REACT_APP_API_URL=http://localhost:5000
REACT_APP_SOCKET_URL=http://localhost:5000

# Production
REACT_APP_API_URL=https://your-api-domain.com
REACT_APP_SOCKET_URL=https://your-api-domain.com
```

### API Integration
- **Base URL**: Configurable API endpoint
- **Proxy**: Development proxy to backend
- **Error Handling**: Centralized error management
- **Request Interceptors**: Authentication headers

## 🚀 Deployment

### Build Process
```bash
npm run build
```

### Deployment Options
- **Static Hosting**: Netlify, Vercel, GitHub Pages
- **CDN**: CloudFront, CloudFlare
- **Server**: Express.js static serving
- **Docker**: Containerized deployment

### Production Optimizations
- **Minification**: CSS and JS minification
- **Compression**: Gzip compression
- **Caching**: Browser caching strategies
- **CDN**: Asset delivery optimization

## 🧪 Testing

### Test Coverage
- **Unit Tests**: Component testing
- **Integration Tests**: Feature testing
- **E2E Tests**: User flow testing
- **Accessibility Tests**: A11y compliance

### Testing Tools
- **Jest**: Test runner
- **React Testing Library**: Component testing
- **Cypress**: E2E testing
- **Axe**: Accessibility testing

## 📱 Mobile Experience

### Responsive Design
- **Breakpoints**: Mobile-first responsive design
- **Touch Interactions**: Optimized touch targets
- **Navigation**: Mobile-friendly navigation
- **Performance**: Optimized for mobile networks

### PWA Features
- **Service Worker**: Offline functionality
- **Web App Manifest**: App-like experience
- **Push Notifications**: Order updates
- **Home Screen**: Add to home screen capability

## 🔍 SEO & Analytics

### SEO Optimization
- **Meta Tags**: Dynamic meta tag management
- **Structured Data**: Product and organization schemas
- **Sitemap**: Dynamic sitemap generation
- **Performance**: Core Web Vitals optimization

### Analytics
- **Google Analytics**: User behavior tracking
- **Event Tracking**: Custom event monitoring
- **Conversion Tracking**: E-commerce tracking
- **Performance Monitoring**: Real user monitoring

## 🐛 Troubleshooting

### Common Issues

1. **Authentication Issues**
   - Clear browser storage and restart
   - Check backend server connection
   - Verify JWT token validity

2. **Cart Not Updating**
   - Check authentication status
   - Verify WebSocket connection
   - Clear cart data and retry

3. **Build Errors**
   - Delete node_modules and reinstall
   - Check Node.js version compatibility
   - Verify environment variables

### Debug Mode
```bash
# Enable debug logging
REACT_APP_DEBUG=true npm start

# Verbose logging
REACT_APP_LOG_LEVEL=debug npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit a pull request

### Development Guidelines
- Follow existing code patterns
- Write meaningful component names
- Add PropTypes for components
- Maintain responsive design
- Test on multiple browsers

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Related

- [Backend Documentation](../backend/README.md)
- [API Documentation](../backend/docs/api.md)
- [Deployment Guide](../docs/deployment.md)

---

**Built with ❤️ using React and Material-UI**