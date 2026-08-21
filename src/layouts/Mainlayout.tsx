import { Outlet } from "react-router";
import Navbar from '../component/Navbar';
import Footer from '../component/Footer';

function Mainlayout() {
    return (
        <>
            <Navbar />
            <main>
                    <Outlet />
            </main>
            <Footer />
        </>
    );
}

export default Mainlayout;
