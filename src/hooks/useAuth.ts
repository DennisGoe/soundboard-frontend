import { useSelector } from 'react-redux';

export const useAuth = () => {
    const token = useSelector((state: any) => state.auth?.token);
    const isAuthenticated = useSelector((state: any) => state.auth?.isAuthenticated);
    const userName = useSelector((state: any) => state.auth?.userName);

    return {
        token,
        isAuthenticated,
        userName
    };
}; 