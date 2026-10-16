import { Link } from "react-router-dom";
import { buttonStyles, EmptyState, TopBar } from "../components/ui";

export default function NotFound() {
  return (
    <>
      <TopBar title="Not found" large={false} back="/" />
      <div className="flex flex-1 items-center justify-center px-safe">
        <EmptyState
          art="🏈"
          title="Out of bounds"
          description="That page went wide right. Let's get you back on the field."
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
