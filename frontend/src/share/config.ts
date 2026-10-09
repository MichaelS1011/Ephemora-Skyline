/**
 * The one place a shared video is allowed to point.
 *
 * Empty means undecided: no landing page exists yet, the repository is
 * private, and there is no analytics endpoint to send anyone to. While this
 * constant is empty the ShareCard names no target and never hints at a star
 * or a repository, because a video that says "look it up" about a link that
 * does not exist is a lie in the user's voice.
 *
 * The operator fills this in. Nothing else in the share lane may introduce a
 * second destination, and nothing here is derived from a path or a scan.
 */
export const SHARE_LINK = "";
