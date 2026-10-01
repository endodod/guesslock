import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="rounded border border-neutral-200 bg-white p-6 text-sm">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-1 text-neutral-600">No admin page, lock or entity here.</p>
      <Link href="/admin" className="mt-3 inline-block text-blue-700 hover:underline">Back to status</Link>
    </div>
  );
}
