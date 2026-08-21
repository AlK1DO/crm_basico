import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider } from './context/AuthContext';
import { DatasetProvider } from './context/DatasetContext';
import AppRoutes from './routers/AppRoutes';

export default function App() {
  return (
    <AuthProvider>
      <DatasetProvider>
        <AppRoutes />
        <ToastContainer
          position="top-right"
          autoClose={3500}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnHover
          draggable
          theme="light"
        />
      </DatasetProvider>
    </AuthProvider>
  );
}
