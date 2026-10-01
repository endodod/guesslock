import { KeyholeLoader } from "@/components/ui";

// Shown instantly while a lock's puzzle is loaded on the server.
export default function LockLoading() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-16">
      <KeyholeLoader />
    </div>
  );
}
