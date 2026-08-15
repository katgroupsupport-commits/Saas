import React from "react";
import { useNavigate } from "react-router-dom";
import { Camera } from "lucide-react";
import { Page, Section, ProfilePhoto } from "../components";
import { repository } from "../services/repository";
import { getCurrentMember } from "../services/financeFields";

function serializeError(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function MemberProfile({ state, setState, actor, setConfirmDialog, setNotification, signOut }) {
  const navigate = useNavigate();
  const member = (state.members || []).find((item) =>
    String(item.id) === String(actor?.memberId)
    || (item.email && actor?.email && item.email.toLowerCase() === actor.email.toLowerCase())
  );
  const profile = member ?? {
    fullName: actor?.name || actor?.email || "Member",
    mobile: actor?.mobile || "",
    email: actor?.email || "",
    address: "",
    status: actor?.role || "Active",
    profilePhoto: actor?.profilePhoto || ""
  };
  const profilePhoto = profile.profilePhoto || actor?.profilePhoto || "";

  function uploadPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotification({ type: "error", message: "Please upload an image file." });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const photoData = String(reader.result || "");
      setState((current) => ({
        ...current,
        session: {
          ...current.session,
          user: { ...current.session.user, profilePhoto: photoData }
        },
        members: (current.members || []).map((item) =>
          String(item.id) === String(member?.id)
          || (item.email && actor?.email && item.email.toLowerCase() === actor.email.toLowerCase())
            ? { ...item, profilePhoto: photoData }
            : item
        )
      }));
      try {
        if (repository.isConfigured()) {
          await repository.updateProfilePhoto(photoData);
        }
        setNotification({ type: "success", message: "Profile photo updated." });
      } catch (error) {
        setNotification({ type: "warning", message: "Photo updated on this device. Apply the profile photo database update to save it online.", details: serializeError(error) });
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <Page title="My Profile" subtitle="Your account information" action={null}>
      <Section title="Profile Information">
        <div className="profile-info profile-info-card">
          <ProfilePhoto photo={profilePhoto} name={profile.fullName} large />
          <div>
            <p><strong>Name:</strong> {profile.fullName}</p>
            <p><strong>Mobile:</strong> {profile.mobile || "Not provided"}</p>
            <p><strong>Email:</strong> {profile.email || "Not provided"}</p>
            <p><strong>Address:</strong> {profile.address || "Not provided"}</p>
            <p><strong>Status:</strong> {profile.status}</p>
          </div>
        </div>
        <div className="button-row">
          <label className="secondary-button upload-button">
            <Camera size={16} />
            <span>Upload photo</span>
            <input type="file" accept="image/*" onChange={uploadPhoto} />
          </label>
          <button type="button" className="secondary-button" onClick={() => navigate("/select-group")}>Switch group</button>
          <button type="button" className="secondary-button" onClick={signOut}>Logout</button>
        </div>
      </Section>
    </Page>
  );
}

export default MemberProfile;
