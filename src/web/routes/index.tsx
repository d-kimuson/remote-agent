import { Navigate, createFileRoute } from '@tanstack/react-router';

const IndexRedirect = () => {
  return <Navigate to="/projects" />;
};

export const Route = createFileRoute('/')({
  component: IndexRedirect,
});
