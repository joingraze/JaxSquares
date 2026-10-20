import { Link } from "react-router-dom";
import { buttonStyles, EmptyState, Jax, TopBar } from "../components/ui";

export default function NotFound() {
  return (
    <>
      <TopBar title="Not found" large={false} back="/" />
      <div className="flex flex-1 items-center justify-center px-safe">
        <EmptyState
          illustration={<Jax pose="peek" size={156} />}
          title="Out of bounds"
          description="Jax sniffed all over and this page isn't here. Let's get you back on the field."
          action={
            <Link to="/" replace className={buttonStyles({ size: "lg", block: true })}>
              Back to Home
            </Link>
          }
        />
      </div>
    </>
  );
}
