import { useState } from "react";
import { apiSignup } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const { setUser } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiSignup({ name, email, password });
      setUser(res.user);
      nav("/plan");
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 flex items-center justify-center px-4">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden border border-white/20">
        {/* Left / branding */}
        <div className="hidden md:flex flex-col justify-between p-8 bg-gradient-to-br from-emerald-600/30 via-emerald-500/10 to-transparent">
          <div>
            <div className="text-white/90 font-semibold text-lg tracking-wide">
              Fleet Planner
            </div>
            <div className="text-white text-3xl font-bold leading-snug mt-4">
              Welcome 👋
            </div>
            <div className="text-white/70 text-sm mt-4 leading-relaxed">
              The first account registered in the system will
              <span className="text-white font-semibold">
                {" "}
                automatically be an admin{" "}
              </span>
              with control over task management and work monitoring.
            </div>
          </div>

          <div className="text-white/40 text-xs">
            Important: Keep your credentials safe.
          </div>
        </div>

        {/* Right / form */}
        <div className="bg-white p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Create New Account
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Sign up to start managing your fleet and tracking tasks.
          </p>

          {err && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {err}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                User Name
              </label>
              <input
                className="input-field w-full"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                className="input-field w-full"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                className="input-field w-full"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              className="btn-primary w-full py-2 font-semibold"
              type="submit"
            >
              Sign Up
            </button>
          </form>

          <div className="mt-6 text-sm text-center text-gray-600">
            Already have an account?{" "}
            <Link className="text-blue-600 hover:underline" to="/login">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
