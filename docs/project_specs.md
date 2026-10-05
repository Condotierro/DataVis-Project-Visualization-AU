An important part of the Data Visualization course is the semester-long course project. In this project, you will develop an interactive data visualization for a dataset of your own choosing. There are many good reasons for such a practical project running alongside the course – some of which are:

* To understand how the concepts, algorithms, and frameworks from the lecture relate to practical questions and issues of visualization;
* To test-drive your visualization skills in an environment of frequent constructive input and guidance from your peers and the lecturer;
* To apply your visual literacy and critical thinking skills to evaluate your own work;
* To showcase what you’ve learned in this lecture in a tangibe way that goes beyond the mere grade (e.g., as part of a project portfolio for job applications);
* To find out whether data visualization is actually your thing and which aspects of it you like best (graphic design, software engineering, data analytics, visual storytelling / data journalism,...)
* To prepare you for a potential MSc thesis project in visualization.

To wet your appetite for this project and to give you an inspiration for your own project, you can find some of the previous course projects at [https://vis-au.github.io/student_projects/](https://vis-au.github.io/student_projects/) (scroll down to Course Projects).

**Report deadline:** 11-DEC-2026 (end of day)

**Hand-in via Brightspace:** [here](https://www.google.com/search?q=https://brightspace.au.dk/d2l/common/dialogs/quickLink/quickLink.d2l%3Fou%3D219790%26type%3Ddropbox%26rcode%3D600110B8-086A-4E95-9169-1AA65B8BC276-1257351)

**Guidelines for preparing the report:**

* max. 6 pages total, PDF format only
* introduction and motivation - ca. 0.5 pages
* description of the visualization problem (data + task abstraction) - ca.1 page
* related work/existing solutions if any - ca. 0.5 pages
* description of the interactive visualization solution (design decisions justified with first principles from lectures) - ca. 1.5 pages
* example use case showing at least 1 instance of the solution (your visualization) helping with the problem (e.g., supporting the task) - ca.1 page
* short discussion of limitations - ca. 0.5 pages
* in case of group work: clear description who was responsible for which aspects of the project, and which were taken on jointly - ca. 0.5 pages
* bibliography as an appendix
* [AI declaration](https://studerende.au.dk/en/gai) as an appendix - mandatory! Please also declare your "non-use" if you have not used AI, to make this as explicit as possible.

Please note that in the same way as for your visualization, also for your report the overall principle of Form-follows-Function applies. This means, you should use the report structure that best fits your report contents and not vice versa! Think about what you need to get across to the censors, so that we can best gauge the efforts you have put into your project, and then adjust the suggested report structure above accordingly! For example, if you spent half the semester to get your visualization on the GPU so that it runs smoothly, you should definitely write about that even if there is no dedicated section on Implementation in the suggested report structure above.

**Guidelines for preparing the video:**

* max. 5 minutes
* either uploaded as MP4 or put on Youtube/Rumble/Bitchute... (or both)
* in case of the file being too large for handin via Brightspace use [Handbrake](https://handbrake.fr)
* voice over in English

---

## From Lecture 01 slides (Hans-Jörg Schulz, DataVis 2026, "Visualization Project" section, pp. 116–125)

Source: `lecture01.pdf` (Introduction lecture).

### Why do a practical project?

* To understand how the concepts, algorithms, and frameworks from the lecture relate to practical questions and issues of visualization
* To test-drive your visualization skills in an environment of frequent constructive input and guidance from the TAs
* To improve your visual literacy and critical thinking skills
* To showcase what you've learned in this lecture beyond the mere grade (e.g., as part of a project portfolio for job applications)
* To find out whether data visualization is actually your thing and which aspects of it you like best (graphic design, software engineering, data analytics, visual storytelling / data journalism, ...)
* **To prove to me that you have engaged with the lecture contents!**

### How does the DAVI project work? (groups)

* **Group project: 3–4 students per group.**
* Why a group project?
  * More work hours per project → better outcomes: more interesting/complicated problems, more mature results
  * More diversity per project → better outcomes: larger skillset/expertise, more eyes/opinions
  * → Higher grades. The slide shows (by group size): **3 persons: 9.9 · 2 persons: 9.4 · 1 person: 7.8**

### Preconditions & exceptions

* **Precondition: you must align on your group's ambition!**
* A solo project is allowed only if:
  * you are a PhD student and want to use the project's outcome for your thesis
  * you want to integrate the project with a side job you have
  * you want to combine the project with another course project
  * you want to visualize confidential data
  * you cannot work in a team for obvious reasons (e.g., remote participation)

### How does the DAVI project work? (dataset)

You pick a dataset and build an interactive visualization for it.

**Must-haves:**

* Make sure you are an expert on that data!
* Make sure the data is big enough to warrant visualization!
* Make sure to pick data of reasonable quality!

**Nice-to-haves:**

* Align the project with other work you have to do.
* Choose the project so that there is a high possibility for follow-up work.
* Use the project to jump-start your career.

### For you to decide

* Your project team (try to complement each other)
* Dataset (large and complex, but reasonable quality)
* What you want to do with it (goal, question)
* Tooling (must fit your problem)
* Your users and mode of feedback (the more the merrier)
* If and how to make the result public (GitHub, live demo on a webserver, publication, ...)

### Example projects (screenshots, pp. 122–123)

* A Dash app (Winter 2019, Nils Simon & Niklas Müller): heatmap of Bundestag party voting results on motions 2007–2019, with a year slider, search and zoom, and a panel that shows the full motion text.
* The [AU Visualization Research Repository → Student Projects → Course Projects](https://vis-au.github.io/student_projects/) page, 2022 entries: Explorable Cluster Workload Visualization (Google BORG), Bigfoot sightings in the US (choropleth + radial charts + area chart, cross-filtering), Electricity Visualization for German Energy Data 2015–2022, Visualizing Denmark's Crime Statistics.

### Evaluation criteria

* MSc level course → scholarly, academic project
* 10 ECTS → ~250–280 hrs workload per student → **~150 hrs for the course project**
* Visualization project → focus on analytic data visualization → **correctness of visualization**
* **Visualization design decisions are argued for**
* **Resulting visualization must be "interactive"**
* Hand-in: written report (max. 6 pages) + video demo
* **Due: 11-DEC-2026**

### Project ideas & potential datasets

Dataset hubs:

* https://github.com/awesomedata/awesome-public-datasets
* https://data.fivethirtyeight.com
* https://github.com/BuzzFeedNews
* https://cloud.google.com/bigquery/public-data/
* https://datasetsearch.research.google.com
* https://www.datavejviser.dk or https://www.opendata.dk

Possible datasets to explore: Formula 1 data (https://openf1.org), Linux kernel releases (https://kernelnewbies.org/LinuxVersions as a starting point), Wikipedia edits.

### Related: oral exam (from earlier in the same lecture)

* Qualification for the exam: the written report on the course project + the video presentation
* Exam: 20 minutes, internal co-examiner:
  1. oral presentation of the course project + Q&A
  2. answering questions about the lecture material
  3. critiquing a visualization
