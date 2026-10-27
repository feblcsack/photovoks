import { redirect } from 'next/navigation';

/**
 * /admin — redirect to dashboard.
 * No page content here; the real landing page is /admin/dashboard.
 * This prevents a 404 when the proxy redirects back to /admin after login.
 */
export default function AdminRootPage() {
  redirect('/admin/dashboard');
}
