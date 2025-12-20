This pattern works to eliminate the copy paste, tedious, duplication
writing of basic CRUD from the previous code base.

Every model now just need to extends the CRUD model and get the 
implementation of:
- getAll
- get (by id)
- delete
- count


todo/future works needed:
- add common option/filter for prisma 