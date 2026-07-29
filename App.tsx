
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CartProvider } from '@/contexts/cart';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import Layout from '@/components/Layout';
import AdminLayout from '@/components/admin/AdminLayout';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';

// Pages
import IndexPage from '@/pages/Index';
import AboutPage from '@/pages/About';
import ShopPage from '@/pages/Shop';
import ProductDetail from '@/pages/ProductDetail';
import InspirationPage from '@/pages/Inspiration';
import CustomDesignPage from '@/pages/CustomDesign';
import BlogPage from '@/pages/Blog';
import BlogPostPage from '@/pages/BlogPost';
import CartPage from '@/pages/Cart';
import CheckoutPage from '@/pages/Checkout';
import PaymentPage from '@/pages/Payment';
import OrderConfirmationPage from '@/pages/OrderConfirmation';
import OrdersPage from '@/pages/Orders';
import FavoritesPage from '@/pages/Favorites';
import SignInPage from '@/pages/SignIn';
import SignUpPage from '@/pages/SignUp';
import AdminPage from '@/pages/Admin';
import NotFoundPage from '@/pages/NotFound';
import ShippingPolicyPage from '@/pages/ShippingPolicy';
import CareInstructionsPage from '@/pages/CareInstructions';
import PrivacyPolicyPage from '@/pages/PrivacyPolicy';
import TermsOfServicePage from '@/pages/TermsOfService';
import ContactUsPage from '@/pages/ContactUs';

import "./App.css";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  useSessionPersistence();

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <CartProvider>
          <FavoritesProvider>
            <Router>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<IndexPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/contact" element={<ContactUsPage />} />
                  <Route path="/shop" element={<ShopPage />} />
                  <Route path="/product/:id" element={<ProductDetail />} />
                  <Route path="/inspiration" element={<InspirationPage />} />
                  <Route path="/custom" element={<CustomDesignPage />} />
                  <Route path="/blog" element={<BlogPage />} />
                  <Route path="/blog/:slug" element={<BlogPostPage />} />
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/payment" element={<PaymentPage />} />
                  <Route path="/order/confirmation" element={<OrderConfirmationPage />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/favorites" element={<FavoritesPage />} />
                  <Route path="/signin" element={<SignInPage />} />
                  <Route path="/signup" element={<SignUpPage />} />
                  <Route path="/shipping-policy" element={<ShippingPolicyPage />} />
                  <Route path="/care-instructions" element={<CareInstructionsPage />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                  <Route path="/terms-of-service" element={<TermsOfServicePage />} />
                </Route>
                <Route element={<AdminLayout />}>
                  <Route path="/admin" element={<AdminPage />} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Router>
            <Toaster />
          </FavoritesProvider>
        </CartProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
