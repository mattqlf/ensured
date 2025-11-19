"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CliTokenPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    } else if (user) {
      user.getIdToken().then(setToken);
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md max-w-lg w-full">
        <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">CLI Authentication Token</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Copy the token below and paste it into your terminal to authenticate the CLI.
        </p>
        
        {token ? (
          <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded overflow-x-auto">
            <code className="text-sm text-gray-800 dark:text-gray-200 break-all">
              {token}
            </code>
          </div>
        ) : (
          <p>Generating token...</p>
        )}

        <button
          onClick={() => {
            if (token) {
              navigator.clipboard.writeText(token);
              alert("Token copied to clipboard!");
            }
          }}
          className="mt-6 w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
        >
          Copy Token
        </button>
      </div>
    </div>
  );
}
