import StaffGate from "@/components/admin/StaffGate";
import ReviewsAdmin from "@/components/admin/ReviewsAdmin";

export const metadata = { title: "Reviews" };

export default function AdminReviewsPage() {
  return (
    <StaffGate>
      <div className="stack">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="admin-title">Reviews</h1>
          <p className="small">New reviews wait here until someone approves them. Publish genuine reviews whether they&apos;re good or bad; hide only spam, abuse, or ones that share someone else&apos;s personal information.</p>
        </div>
        <ReviewsAdmin />
      </div>
    </StaffGate>
  );
}
