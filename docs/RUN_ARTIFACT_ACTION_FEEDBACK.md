# Run artifact action feedback

The file page associates download, delete and classification failure messages with
the selected file. In a run-scoped artifact view, only failures for files in that
run are displayed. A late response from a previously viewed run does not appear
as a failure of the current run. Returning to that run within the same file page
shows its message again, with the filename, so the user can retry the same action.

Starting another action on a file clears only that file's old message. Other file failures remain
available in their own scope. The ordinary unfiltered file page can show multiple
failed-file messages. These are local page notices; reloading the page starts a
new view. This does not cancel in-flight requests, change downloads or persistence,
or alter the run/artifact API.
